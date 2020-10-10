import { mainViewModel} from "./main-view-model";
export function pageLoaded(args) {
    var page = args.object;
    var broker = mainViewModel;
    page.bindingContext = broker;
}
