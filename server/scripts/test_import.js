const compressor = require('./src/utils/compressor');
console.log('Compressor imported successfully');
compressor.init().then(() => {
    console.log('Compressor initialized successfully');
    process.exit(0);
}).catch(err => {
    console.error('Compressor failed to initialize:', err);
    process.exit(1);
});
