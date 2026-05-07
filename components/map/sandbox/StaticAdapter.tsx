"use client";

import NorthAmericaMap from "../NorthAmericaMap";
import AfricaMap from "../AfricaMap";
import USStatesMap from "../USStatesMap";
import EuropeMap from "../EuropeMap";
import AsiaMap from "../AsiaMap";
import CountyMap from "../CountyMap";
import type { Dimension, DimensionLens } from "@/types";
import type { SetTooltip } from "@/lib/map-utils";
import type { SandboxView } from "./configs";

interface Props {
  view: SandboxView;
  onSelectEntity: (key: string) => void;
  onDrill: (view: SandboxView) => void;
  selectedGeoId: string | null;
  setTooltip: SetTooltip;
  dimension: Dimension;
  lens: DimensionLens;
  showDataCenters: boolean;
}

export default function StaticAdapter({
  view,
  onSelectEntity,
  onDrill,
  selectedGeoId,
  setTooltip,
  dimension,
  lens,
  showDataCenters,
}: Props) {
  const common = {
    onSelectEntity,
    selectedGeoId,
    setTooltip,
    dimension,
    lens,
    showDataCenters,
    onHoverFacility: () => {},
    onLeaveFacility: () => {},
    onSelectFacility: () => {},
  };

  if (view.kind === "counties") {
    return (
      <CountyMap
        stateName={view.state}
        onSelectCounty={(fips) => onSelectEntity(fips)}
        selectedCountyFips={selectedGeoId}
        setTooltip={setTooltip}
        showDataCenters={showDataCenters}
        onHoverFacility={() => {}}
        onLeaveFacility={() => {}}
        onSelectFacility={() => {}}
      />
    );
  }

  if (view.kind === "us-states") {
    return (
      <USStatesMap
        {...common}
        onDoubleClickEntity={(name) =>
          onDrill({ kind: "counties", state: name })
        }
      />
    );
  }

  switch (view.region) {
    case "na":
      return (
        <NorthAmericaMap
          {...common}
          onSelectUsState={(name) => onSelectEntity(name)}
          onDoubleClickUsState={() => onDrill({ kind: "us-states" })}
        />
      );
    case "eu":
      return <EuropeMap {...common} />;
    case "asia":
      return <AsiaMap {...common} />;
    case "africa":
      return <AfricaMap {...common} />;
  }
}
