
module.exports = function (hookArgs, $options) {
    if(!hookArgs || !hookArgs.args) {
        return;
    }
    const unitTesting = $options && $options.env && $options.env.unitTesting || false;
    hookArgs.args.push(`-PunitTesting=${!!unitTesting}`);
};
