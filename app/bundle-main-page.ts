import { mainViewModel } from "./main-view-model";
function pageLoaded(args) {
    var page = args.object;
    page.bindingContext = mainViewModel;
}
exports.pageLoaded = pageLoaded;
