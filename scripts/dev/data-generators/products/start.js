const { run } = require('./migrate');

console.log('Starting data generator...');
run().then(() => {
  console.log('Data generator complete.');
});
