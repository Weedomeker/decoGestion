import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "semantic-ui-css/semantic.min.css";
import App from "./App.jsx";
import "./css/index.css";
import "./css/JobsList.css";
import "./css/lightbox.css";

const router = createBrowserRouter([
  {
    path: "",
    element: <App />,
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  // <React.StrictMode>
  <RouterProvider router={router} />,

  // </React.StrictMode>,
);
