var gulp        = require('gulp');
var g           = require('gulp-load-plugins')({lazy: false});
var noop        = g.util.noop;
var es          = require('event-stream');
var bowerFiles  = require('main-bower-files');
var rimraf      = require('rimraf');
var queue       = require('streamqueue');
var lazypipe    = require('lazypipe');
var stylish     = require('jshint-stylish');
var bower       = require('./bower');
var jade        = require('gulp-jade');
var util        = require('util');
var browserSync = require('browser-sync');
var del         = require('del');

var reload = browserSync.reload;
// GULP PATHS
var errorHandler    = require('./build/errors');
var config          = require('./build/config');
var client          = config.client;
var tmp             = config.build;
var dist             = config.dist;
var runServers    = require('./servers.runner.js')
var AUTOPREFIXER_BROWSERS = [
  'ie >= 10',
  'ie_mob >= 10',
  'ff >= 30',
  'chrome >= 34',
  'safari >= 7',
  'opera >= 23',
  'ios >= 7',
  'android >= 4.4',
  'bb >= 10'
];

/*
 | ###################################
 |
 | GULP - Every task is listed in the order it is called;
 |
 | NOTE: Tasks that are long are call are wrapped in functions that are listed near the bottom
 |       The purpose of this is to help beiginners approach overwhelming gulp files
 |
 | ###################################
 */


/*
 * Default
 * -> gulp
 * -> serve
 * -> server
 */
// gulp.task('default', ['server']);
// gulp.task('serve', ['server']);
gulp.task('build', ['build:dist']);
/*
 | Do all building tasks for local development environment server
 | Inject bower dependencies in the index.html
 | Then run watch
 | Then run the server
 | Call the gulp stream callback instead of returning;*/
gulp.task('server', [
  'server:build',
  'inject:bower'],
  function ( callback ){
    g.runSequence(
      'watch',
      ['server:run'],
      callback
    );
  }
);

gulp.task('default', ['clean'], function (cb) {
  runSequence('styles', ['jshint', 'images', 'fonts', 'copy'], cb);
});

/*
 | CLEAN and remove the .tmp directory
 */
gulp.task('clean', del.bind(null, ['./.tmp', './dist']));

/*
 | Clean out the .tmp directory
 | Js hint all client side scritps
 | Compile all template into the .tmp directory as js files
 | Once everything is compiled and checked, inject everything into the index.html */
gulp.task('server:build',[
  'clean',
  'jshint',
  'compile:templates'],
  function( cb ){
    return buildServerInjector();
  }
);

/*
 |  JSHINT on client side scripts, but leaving them in there place;
 */
// Lint JavaScript
gulp.task('jshint', function () {
  return gulp.src(client.scripts.root, client.scripts.modules)
    .pipe(reload({stream: true, once: true}))
    .pipe( g.jshint())
    .pipe( g.jshint.reporter('jshint-stylish'))
    .pipe( g.if(!browserSync.active, g.jshint.reporter('fail')));
});

gulp.task('images', function () {
  return gulp.src(client.images)
    .pipe( g.cache( g.imagemin({
      progressive: true,
      interlaced: true
    })))
    .pipe( gulp.dest( dist.images ) )
    .pipe( g.size( {title: 'images'} ));
});
gulp.task('styles', function () {
  // For best performance, don't add Sass partials to `gulp.src`
  return gulp.src( client.styles.css )
    .pipe( g.changed('styles', {extension: '.css'} ) )
    .on( 'error', console.error.bind( console ) )
    .pipe( g.autoprefixer( {browsers: AUTOPREFIXER_BROWSERS} ) )
    .pipe( gulp.dest( tmp.stylePath ) )
    // Concatenate And Minify Styles
    .pipe( g.if('*.css', g.csso() ) )
    .pipe( gulp.dest( dist.stylePath ) )
    .pipe( g.size( {title: 'styles'} ) );
});

gulp.task('copy', function () {
  return gulp.src([
    client.path + '*',
    '!'+client.index,
    'node_modules/apache-server-configs/dist/.htaccess'
  ], {
    dot: true
  }).pipe( gulp.dest( dist.path ) )
    .pipe( g.size( {title: 'copy'} ) );
});

gulp.task('html', function(){
  var assets = g.useref.assets();
  return gulp.src( client.index )
    .pipe( assets )
    .pipe( g.if('*.js', g.uglify()))
    .pipe( g.if('*.css', g.minifyCss()))
    .pipe( assets.restore() )
    .pipe( g.useref() )
    .pipe(gulp.dest( dist.path ));
});
/*
 | COMPILE Both jade and html templates into the .tmp/templates
 */
gulp.task('compile:templates', function (done){
  g.runSequence([
    'compile:jade',
    'compile:html'
  ], done)
});

/*
 | COMPILE JADE and place them into the .tmp directory
 */
gulp.task('compile:jade', function(){
  return gulp.src( client.templates.jade )
    .pipe( g.jade() )
    .pipe( g.angularTemplatecache( config.jade_file_name, { module: config.module_name }))
    .pipe( gulp.dest( config.build.templatesPath ))
    .pipe( g.livereload() );
});

/*
 | COMPILE JADE and place them into the .tmp directory
 */
gulp.task('compile:html', function(){
  return gulp.src( client.templates.html )
    .pipe( g.angularTemplatecache( config.html_file_name, { module: config.module_name } ) )
    .pipe( gulp.dest( config.build.templatesPath ) )
    .pipe( g.livereload() );
});

/*
 |  INJECT BOWER DEPENDENCIES with wiredep
 */
gulp.task('inject:bower', function () {

  var wiredep = require('wiredep').stream;
  gulp.src(client.index)
    .pipe(wiredep({
      directory: client.bower,
      exclude: ['bootstrap-sass-official']
    }))
    .pipe( gulp.dest( client.path ) );
});

/*
 |  WATCH Files
 */
gulp.task('watch', function(){
  gulp.watch( [client.scripts.root, client.scripts.modules], ['jshint:scripts']);
  gulp.watch([client.templates.html, client.templates.jade], ['compile:templates']);

  // gulp.watch( './gulperfile.js', ['gulper'] );
  // Watch the .tmp directory
  watchTmpDirectory()
});

/*
 |  SERVER the base server located in servers.runner.js
 */
gulp.task('serve', ['serve']);
gulp.task('serve',['styles'], function () {
  browserSync({
    notify: false,
    // https: true,
    server: ['.tmp', 'client']
  });
  runServers.base();
  gulp.watch(client.templates.html, reload);
  gulp.watch(client.styles.css, ['styles', reload]);
  gulp.watch([client.scripts.root].concat(client.scripts.modules), ['jshint']);
  gulp.watch(client.images, reload);
});

// Build and serve the output from the dist build
gulp.task('serve:dist', ['default'], function () {
  browserSync({
    notify: false,
    // https: true,
    server: 'dist'
  });
});


/*
 | ====== END GULP DEFAULT
 | ====== END GULP SERVER
 | ====== END GULP SERVE
 */



/*
 |=========================
 |
 |  GULP DIST TASKS
 |
 |========================
 */

gulp.task('dist',[
  'clean'],
  function ( callback ){
    g.runSequence('dist:index',['dist:build'], 'dist:server', callback);
  }
);

/*
 | CLEAN and remove the dist directory
 */
gulp.task('clean:dist', function ( ){

  return gulp.src( 'dist' ).pipe( g.clean() );
});

gulp.task('dist:index', function(){
  return gulp.src( client.path + '*' )
    .pipe( gulp.dest( dist.path ) );
});

gulp.task('dist:build', [
  'build:scripts',
  'build:styles',
  'build:templates',
  'build:images',
  'build:bower'],
  function ( callback ){
    return buildDistInjector();
  }
);

gulp.task('build:scripts', ['scripts:root', 'scripts:bundle', 'scripts:vendor']);

gulp.task('scripts:root', function(){
  return gulp.src(client.scripts.root)
    .pipe( g.jshint())
      .on('error', errorHandler.onWarning )
    .pipe( g.jshint.reporter('default') )
    .pipe( g.ngAnnotate() )
    .pipe( g.rename(config.app_file_name ) )
    .pipe( gulp.dest( dist.scriptPath ) );
});
gulp.task('scripts:bundle', function(){
  return gulp.src( client.scripts.modules )
    .pipe( g.jshint() )
      .on('error', errorHandler.onWarning )
    .pipe( g.jshint.reporter('default') )
    .pipe( g.ngAnnotate() )
    .pipe( g.concat( config.modules_file_name ) )
    .pipe( g.uglify() )
    .pipe( gulp.dest( dist.scriptPath ) )
});
gulp.task('scripts:vendor', function(){
  return gulp.src( client.vendor )
    .pipe( g.concat( config.vendor_file_name ) )
    .pipe( g.uglify() )
    .pipe( gulp.dest( dist.scriptPath ) );
});

/*
 |  BUILD STYLES concat and minify all client styles to the dist/styles directory
 */
gulp.task('build:styles', function() {
  return gulp.src( client.styles.css )
    .pipe( g.concat( config.css_file_name ) )
    .pipe( g.minifyCss( ) )
    .pipe( gulp.dest( dist.stylePath ) );
});

/*
 |  BUILD TEMPLATES compile templates to the .tmp/templates/
 |                - concat and minify all templates to the dist/templates directory
 */
gulp.task('build:templates', [
  'compile:templates'],
  function (){
    return gulp.src( tmp.templates )
      .pipe( g.concat( config.templates_file_name ) )
      .pipe( g.uglify() )
      .pipe( gulp.dest( dist.templatePath ) );
  }
);

/*
 |  MINIFY IMAGES
 */
gulp.task('build:images', function() {
  return gulp.src( client.images )
    // .pipe( changed( tmp.images ) )
    .pipe( g.imagemin() )
    .pipe(gulp.dest( dist.images ));
});

/*
 |  BUILD BOWER copy all bower files to the dist/bower_components directory
 |            - inject all bower scripts and styles into index.html
 */
gulp.task('build:bower',[
  'dist:bower:files'],
  function ( callback ){
    g.runSequence('dist:inject:bower', callback);
  }
);

/*
 |  DIST BOWER FILES copy all bower files to the dist/bower_components directory
 */
gulp.task('dist:bower:files', function(){
  return g.bower( client.bower )
    .pipe( gulp.dest( dist.bower ) )
});

/*
 |  DIST INJECT BOWER inject all bower scripts and styles into index.html
 */
gulp.task('dist:inject:bower', function(){
  var wiredep = require('wiredep').stream;
  return gulp.src( dist.index )
    .pipe(wiredep({
      directory: dist.bower,
      exclude: ['bootstrap-sass-official']
    }))
  .pipe( gulp.dest( dist.path ) );
});

/*
 |  DIST SERVER run the base server located in servers.runner.js for dist
 */
gulp.task('dist:server', function () {
  process.env.NODE_ENV = 'production';
  runServers.base();
});

// Minify app.js to .tmp/scripts/app.min.js
// Concat & minify all angular files to .tmp/scripts/bundle.min.js
// Concat & minify bower files to .tmp/bower/bower_coponents.min.js
// Concat & minify vendor files to .tmp/vendor/vendor.min.js
// Concat & minify all jade & html templates into .tmp/templates/
// Inject all scripts, styles, and templates
// Server up dist;


/*
 |  INJECT STYLES  (Only used when a new file is added during gulp.watch)
 */
gulp.task('inject:styles', function(){
  var index = gulp.src( client.index );
  var styles = gulp.src([client.styles.css], { read: false } );
  return index
    .pipe( g.inject( styles, { name:'styles', addRootSlash: false, relative:true }))
    .pipe( gulp.dest( client.path ) );
});

/*
 |  INJECT SCRIPTS  (Only used when a new file is added during gulp.watch)
 */
gulp.task('inject:scripts',[
  'jshint:scripts'],
  function(){
    var target = gulp.src( client.index );
    var bundle = gulp.src( client.scripts.modules, {read: false} );
    return target
      .pipe(g.inject(bundle, {
          addRootSlash: false,
          relative: true,
          name: 'bundle',
        }))
      .pipe( gulp.dest( client.path ) )
  }
);

/*
 |  INJECT TEMPLATES  (Only used when a new file is added during gulp.watch)
 */
gulp.task('inject:templates', function(){
  var target = gulp.src( client.index );
  var templates = gulp.src( tmp.templates, {read: false} );
  return target
    .pipe(g.inject(templates, {
      addRootSlash: true,
      name: 'templates',
      ignorePath: '.tmp'
    })).pipe(gulp.dest( client.path ));
});

/*
 |  INJECT VENDORS  (Only used when a new file is added during gulp.watch)
 */
gulp.task('inject:vendor', function(){
  var target = gulp.src( client.index );
  var vendor = gulp.src( client.vendor, {read: false} );
  return target
    .pipe( g.inject( bundle, {
        addRootSlash: false,
        relative: true,
        name: 'vendor',
    } ) )
    .pipe( gulp.dest( client.path ) );
});


/*
 | Notify the console during live reload with the files name
 */
function notifyLiveReload(event){
  console.log('File ' + event.path + ' was ' + event.type + ', reloading...');
  gulp.src(event.path, { read:false })
    .pipe( g.livereload( ) );
}

/*
 |  Watch the .tmp directory for changes
 */
function watchTmpDirectory(){
  var BuiltFiles = [
    client.scripts.root,
    client.scripts.modules,
    tmp.styles + '*.css',
    tmp.scripts + '*.js',
    tmp.templates + '*.js',
  ]
  gulp.watch(BuiltFiles, notifyLiveReload)
}

/*
 | INJECT all scritps into index.html;
 */
function injector(options){
  return options.target
    .pipe( g.inject(options.styles.src, options.styles.params) )
    .pipe( g.inject(options.vendor.src, options.vendor.params) )
    .pipe( g.inject(options.root.src, options.root.params) )
    .pipe( g.inject(options.bundle.src, options.bundle.params) )
    .pipe( g.inject(options.templates.src, options.templates.params) )
    .pipe( gulp.dest( options.dest ) );

}
function injectorDist(options){
  return options.target
    .pipe( g.inject(options.styles.src, options.styles.params) )
    .pipe( g.inject(options.vendor.src, options.vendor.params) )
    .pipe( g.inject(options.root.src, options.root.params) )
    .pipe( g.inject(options.bundle.src, options.bundle.params) )
    .pipe( g.inject(options.templates.src, options.templates.params) )
    .pipe( gulp.dest( dist.path ) );

}

/*
 | BUILD INJECTOR PARAMS for gulp server then call injector()
 */
function buildServerInjector(){
  var options = {
      target: gulp.src( client.index ),
      dest: client.path,
      styles: {
        src: gulp.src( client.styles.css, {read:false}),
        params: {addRootSlash:false, relative:true, name:'styles'}
      },
      vendor: {
        src: gulp.src( client.vendor, {read:false}),
        params: {addRootSlash:false, relative:true, name:'vendor'}
      },
      root: {
        src: gulp.src( client.scripts.root, {read:false}),
        params: {addRootSlash:false, relative:true, name:'root'}
      },
      bundle:{
        src: gulp.src( client.scripts.modules, {read:false}),
        params: {addRootSlash:false, relative:true, name:'bundle'}
      },
      templates: {
        src: gulp.src( tmp.templates, {read:false}),
        params: {addRootSlash:true, ignorePath:'.tmp', name:'templates'}
      }
    }
    return injector(options);
}

/*
 | BUILD INJECTOR PARAMS for gulp server then call injector()
 */
function buildDistInjector(){
  var options = {
      target: gulp.src( dist.index ),
      dest: dist.path,
      styles: {
        src: gulp.src( dist.styles, {read:false}),
        params: {addRootSlash:false, relative:true, name:'styles'}
      },
      vendor: {
        src: gulp.src( dist.scriptPath + config.vendor_file_name, {read:false}),
        params: {addRootSlash:false, relative:true, name:'vendor'}
      },
      root: {
        src: gulp.src( dist.scriptPath + config.app_file_name, {read:false}),
        params: {addRootSlash:false, relative:true, name:'root'}
      },
      bundle:{
        src: gulp.src( dist.scriptPath + config.modules_file_name, {read:false}),
        params: {addRootSlash:false, relative:true, name:'bundle'}
      },
      templates: {
        src: gulp.src( dist.templates, {read:false}),
        params: {addRootSlash:false, relative:true, name:'templates'}
      }
    }
    return injectorDist(options);
}