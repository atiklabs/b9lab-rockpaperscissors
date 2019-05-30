module.exports = {
    entry: "./app/js/rockpaperscissors.js",
    output: {
        path: __dirname + "/build/app/js",
        filename: "rockpaperscissors.js",
        libraryTarget: 'var',
        library: 'rockpaperscissors'
    },
    module: {
        rules: [],
    },
    watch: true
};