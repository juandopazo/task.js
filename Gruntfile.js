module.exports = function(grunt) {

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        concat: {
            browser: {
                src: [
                    'support/browser/head.js',
                    'lib/*.js',
                    'support/browser/tail.js'
                ],
                dest: 'dist/<%= pkg.name %>.browser.js'
            },
            amd: {
                src: [
                    'support/amd/head.js',
                    'lib/*.js',
                    'support/amd/tail.js'
                ],
                dest: 'dist/<%= pkg.name %>.amd.js'
            }
        },
        uglify: {
            my_target: {
                files: {
                    'dist/<%= pkg.name %>.browser-min.js': ['dist/<%= pkg.name %>.browser.js'],
                    'dist/<%= pkg.name %>.amd-min.js': ['dist/<%= pkg.name %>.amd.js']
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.registerTask('default', ['concat', 'uglify']);

};