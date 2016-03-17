import vmModule = require("./main-view-model");

export function pageNavigatedTo(args) {
    var page = args.object;
    var broker = vmModule.mainViewModel;
    page.bindingContext = broker;
    broker.executeTestRun();
}
