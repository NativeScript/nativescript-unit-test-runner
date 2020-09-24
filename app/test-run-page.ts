import { mainViewModel } from "./main-view-model";

export function pageNavigatedTo(args) {
    var page = args.object;
    var broker = mainViewModel;
    page.bindingContext = broker;
    broker.executeTestRun();
}
