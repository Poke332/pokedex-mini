import MainPage from "./pages/MainPage.jsx"
import DetailsPage from "./pages/DetailsPage.jsx"
import NotFoundPage from "./pages/NotFoundPage.jsx"
import Layout from "./pages/Layout.jsx"
import TypeAdvantagePage from "./pages/TypeAdvantagePage.jsx"
import BerryPage from "./pages/BerryPage.jsx"
import BerryDetailPage from "./pages/BerryDetailPage.jsx"
import ItemsPage from "./pages/ItemsPage.jsx"
import ItemDetailPage from "./pages/ItemDetailPage.jsx"
import MovesPage from "./pages/MovesPage.jsx"
import MoveDetailPage from "./pages/MoveDetailPage.jsx"
import MachinesPage from "./pages/MachinesPage.jsx"
import MachineDetailPage from "./pages/MachineDetailPage.jsx"
import PartyPage from "./pages/PartyPage.jsx"
import {Routes, Route, HashRouter} from "react-router-dom"

function App() {

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<MainPage />} />
          <Route path="pokemon/:name" element={<DetailsPage />} />
          <Route path="type-advantage" element={<TypeAdvantagePage />} />
          <Route path="berries" element={<BerryPage />} />
          <Route path="berry/:name" element={<BerryDetailPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="item/:name" element={<ItemDetailPage />} />
          <Route path="moves" element={<MovesPage />} />
          <Route path="move/:name" element={<MoveDetailPage />} />
          <Route path="machines" element={<MachinesPage />} />
          <Route path="machine/:id" element={<MachineDetailPage />} />
          <Route path="party" element={<PartyPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </HashRouter>
  )
}

export default App
