import { useListings } from "./hooks/useListings";
import { Header } from "./components/Header/Header";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { MapView } from "./components/Map/MapView";
import "./App.css";

function App() {
  const {
    loading,
    error,
    allListings,
    cities,
    selectedCity,
    setSelectedCity,
    timeSlotGroups,
    selectedId,
    setSelectedId,
    hoveredId,
    setHoveredId,
  } = useListings();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading listings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <p>Error loading data: {error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        cities={cities}
        selectedCity={selectedCity}
        onCityChange={setSelectedCity}
        timeSlotGroups={timeSlotGroups}
        totalListings={allListings.length}
      />
      <div className="app-body">
        <Sidebar
          timeSlotGroups={timeSlotGroups}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />
        <MapView
          timeSlotGroups={timeSlotGroups}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />
      </div>
    </div>
  );
}

export default App;
