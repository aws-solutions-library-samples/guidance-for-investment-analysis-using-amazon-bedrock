import "@cloudscape-design/global-styles/index.css";
import ReactDOM from "react-dom/client";
import { StorageHelper } from "./common/helpers/storage-helper";
import AppConfigured from "./components/app-configured";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

const theme = StorageHelper.getTheme();
StorageHelper.applyTheme(theme);

root.render(
  <>
    <AppConfigured />
  </>,
);
