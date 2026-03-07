const { AutoTokenizer, pipeline } = require('@xenova/transformers');
console.log('Transformers exports:', Object.keys(require('@xenova/transformers')));
if (AutoTokenizer) console.log('AutoTokenizer is present');
else console.error('AutoTokenizer is MISSING');
process.exit(0);
