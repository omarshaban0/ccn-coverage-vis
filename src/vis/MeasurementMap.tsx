import React, { useEffect, useState } from 'react';
import { MapType } from './MapSelectionRadio';
import { API_URL } from '../utils/config';
import * as L from 'leaflet';
import * as d3 from 'd3';
import {
  siteMarker,
  siteSmallMarker,
  isSiteArray,
} from '../leaflet-component/site-marker';
import getBounds from '../utils/get-bounds';
import MapLegend from './MapLegend';
import fetchToJson from '../utils/fetch-to-json';
import Loading from '../Loading';
import axios from 'axios';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet-geosearch/dist/geosearch.css';

const ATTRIBUTION =
  'Map tiles by <a href="http://stamen.com">Stamen Design</a>, ' +
  'under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. ' +
  'Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, ' +
  'under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.';

const URL = `https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}${
  devicePixelRatio > 1 ? '@2x' : ''
}.png`;

const BIN_SIZE_SHIFT = 0;
const DEFAULT_ZOOM = 10;
const LEGEND_WIDTH = 25;

function cts(p: Cell): string {
  return p.x + ',' + p.y;
}

export const UNITS = {
  dbm: 'dBm',
  ping: 'ms',
  download_speed: 'Mbps',
  upload_speed: 'Mbps',
} as const;

export const MULTIPLIERS = {
  dbm: 1,
  ping: 1,
  download_speed: 1,
  upload_speed: 1,
} as const;

export const MAP_TYPE_CONVERT = {
  dbm: 'Signal Strength',
  ping: 'Ping',
  download_speed: 'Download Speed',
  upload_speed: 'Upload Speed',
} as const;

interface MapProps {
  mapType: MapType;
  selectedSites: SiteOption[];
  selectedDevices: DeviceOption[];
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  width: number;
  height: number;
  loading: boolean;
  top: number;
  allSites: Site[];
  cells: Set<string>;
  setCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  overlayData: number;
  setOverlayData: React.Dispatch<React.SetStateAction<number>>;
  timeFrom: Date;
  timeTo: Date;
}

const MeasurementMap = ({
  mapType,
  selectedSites,
  selectedDevices,
  setLoading,
  width,
  height,
  loading,
  top,
  allSites,
  cells,
  setCells,
  overlayData,
  setOverlayData,
  timeFrom,
  timeTo,
}: MapProps) => {
  const [cDomain, setCDomain] = useState<number[]>();
  const [map, setMap] = useState<L.Map>();
  const [bins, setBins] = useState<number[][]>([]);
  const [bounds, setBounds] =
    useState<{ left: number; top: number; width: number; height: number }>();
  // Data squares
  const [layer, setLayer] = useState<L.LayerGroup>();
  // Layer for boundaries
  const [blayer, setBLayer] = useState<L.LayerGroup>();
  // Markers for sites
  const [mlayer, setMLayer] = useState<L.LayerGroup>();
  const [siteSummary, setSiteSummary] = useState<any>();
  // Markers for manual data points
  const [slayer, setSLayer] = useState<L.LayerGroup>();
  const [llayer, setLLayer] = useState<L.LayerGroup>();
  const [markerData, setMarkerData] = useState<Marker[]>();

  useEffect(() => {
    (async () => {
      const dataRange = await fetchToJson(API_URL + '/api/dataRange');
      const _map = L.map('map-id').setView(dataRange.center, DEFAULT_ZOOM);
      const _bounds = getBounds({ ...dataRange, map: _map, width, height });

      L.tileLayer(URL, {
        attribution: ATTRIBUTION,
        maxZoom: 16,
        minZoom: 10,
        opacity: 0.7,
        zIndex: 1,
      }).addTo(_map);

      setBounds(_bounds);
      setMap(_map);
      setLayer(L.layerGroup().addTo(_map));
      setBLayer(L.layerGroup().addTo(_map));
      setSLayer(L.layerGroup().addTo(_map));
      setMLayer(L.layerGroup().addTo(_map));
      setLLayer(L.layerGroup().addTo(_map));

      const search = new (GeoSearchControl as any)({
        provider: new OpenStreetMapProvider(),
        style: 'bar', // optional: bar|button  - default button
      });
      _map.addControl(search);
    })();
  }, [width, height]);

  useEffect(() => {
    (async () => {
      if (allSites.length === 0) {
        return;
      }
      const _siteSummary = await fetchToJson(
        API_URL +
          '/api/sitesSummary?' +
          new URLSearchParams([
            ['timeFrom', timeFrom.toISOString()],
            ['timeTo', timeTo.toISOString()],
          ]),
      );
      setSiteSummary(_siteSummary);
    })();
  }, [allSites, timeFrom, timeTo]);

  useEffect(() => {
    if (!map || !siteSummary || !slayer || !blayer) return;
    // TODO: MOVE TO UTILS;
    const greenIcon = new L.Icon({
      iconUrl:
        'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    const goldIcon = new L.Icon({
      iconUrl:
        'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    const redIcon = new L.Icon({
      iconUrl:
        'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    slayer.clearLayers();
    const _markers = new Map<string, L.Marker>();
    const _sites: Site[] = allSites || [];
    if (!isSiteArray(_sites)) {
      throw new Error('data has incorrect type');
    }
    blayer.clearLayers();
    for (let site of _sites) {
      if (site.boundary) {
        L.polygon(site.boundary, { color: site.color ?? 'black' }).addTo(
          blayer,
        );
        console.log(site.boundary);
      }
      _markers.set(
        site.name,
        siteMarker(site, siteSummary[site.name], map).addTo(slayer),
      );
    }
    _markers.forEach((marker, site) => {
      if (selectedSites.some(s => s.label === site)) {
        marker.setOpacity(1);
      } else {
        marker.setOpacity(0.5);
      }
      if (allSites.some(s => s.name === site && s.status === 'active')) {
        marker.setIcon(greenIcon);
      } else if (
        allSites.some(s => s.name === site && s.status === 'confirmed')
      ) {
        marker.setIcon(goldIcon);
      } else if (
        allSites.some(s => s.name === site && s.status === 'in-conversation')
      ) {
        marker.setIcon(redIcon);
      }
    });
  }, [selectedSites, map, allSites, siteSummary, slayer, blayer]);

  useEffect(() => {
    (async () => {
      if (selectedSites.length === 0 || selectedDevices.length === 0) {
        setMarkerData([]);
        return;
      }
      const markerRes = await axios.get(API_URL + '/api/markers', {
        params: {
          sites: selectedSites.map(ss => ss.label).join(','),
          devices: selectedDevices.map(ss => ss.label).join(','),
          timeFrom: timeFrom.toISOString(),
          timeTo: timeTo.toISOString(),
        },
      });
      setMarkerData(markerRes.data);
    })();
  }, [selectedSites, selectedDevices, timeFrom, timeTo]);

  useEffect(() => {
    if (!map || !markerData || !llayer) return;
    llayer.clearLayers();
    const _markers = new Map<string, L.Marker>();
    markerData.forEach(m =>
      _markers.set(m.mid, siteSmallMarker(m).addTo(llayer)),
    );
    const smallIcon = new L.Icon({
      iconUrl:
        'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
      // shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [20, 35],
      iconAnchor: [12, 35],
      popupAnchor: [1, -34],
      // shadowSize: [35, 35]
    });
    _markers.forEach((marker, site) => {
      marker.setIcon(smallIcon);
    });
  }, [markerData, map, llayer]);

  useEffect(() => {
    if (!map || !bounds || !layer) return;

    (async () => {
      if (!map) {
        return;
      }
      setBins(
        await fetchToJson(
          API_URL +
            '/api/data?' +
            new URLSearchParams([
              ['width', bounds.width + ''],
              ['height', bounds.height + ''],
              ['left', bounds.left + ''],
              ['top', bounds.top + ''],
              ['binSizeShift', BIN_SIZE_SHIFT + ''],
              ['zoom', DEFAULT_ZOOM + ''],
              ['selectedSites', selectedSites.map(ss => ss.label).join(',')],
              ['mapType', mapType],
              ['timeFrom', timeFrom.toISOString()],
              ['timeTo', timeTo.toISOString()],
            ]),
        ),
      );
    })();
  }, [
    selectedSites,
    mapType,
    setLoading,
    map,
    layer,
    bounds,
    timeFrom,
    timeTo,
  ]);

  useEffect(() => {
    if (!map || !bounds || !layer) return;

    setLoading(true);
    (async () => {
      const colorDomain = [
        d3.max(bins, d => d[1] * MULTIPLIERS[mapType]) ?? 1,
        d3.min(bins, d => d[1] * MULTIPLIERS[mapType]) ?? 0,
      ];

      const colorScale = d3.scaleSequential(colorDomain, d3.interpolateViridis);
      setCDomain(colorDomain);

      layer.clearLayers();
      bins.forEach(p => {
        const idx = p[0];
        const bin = Number(p[1]);
        if (bin) {
          const x = ((idx / bounds.height) << BIN_SIZE_SHIFT) + bounds.left;
          const y = (idx % bounds.height << BIN_SIZE_SHIFT) + bounds.top;

          const sw = map.unproject([x, y], DEFAULT_ZOOM);
          const ne = map.unproject(
            [x + (1 << BIN_SIZE_SHIFT), y + (1 << BIN_SIZE_SHIFT)],
            DEFAULT_ZOOM,
          );

          L.rectangle(L.latLngBounds(sw, ne), {
            fillColor: colorScale(bin * MULTIPLIERS[mapType]),
            fillOpacity: 0.75,
            stroke: false,
          })
            .bindTooltip(`${bin.toFixed(2)} ${UNITS[mapType]}`, {
              direction: 'top',
            })
            .addTo(layer)
            .on('click', e => {
              const cs = cells;
              const c = cts({ x: x, y: y });
              if (cs.has(c)) {
                cs.delete(c);
              } else {
                cs.add(c);
              }
              setCells(new Set(cs));
              // console.log(cs);
            });
        }
      });
      setLoading(false);
    })();
  }, [
    bins,
    setCells,
    cells,
    selectedSites,
    mapType,
    setLoading,
    map,
    layer,
    bounds,
  ]);

  useEffect(() => {
    if (!map || !bounds || !layer || !mlayer || !bins) return;
    (async () => {
      mlayer.clearLayers();
      var binSum: number = 0;
      var binNum: number = 0;
      bins.forEach(p => {
        const idx = p[0];
        const bin = Number(p[1]);
        if (bin) {
          const x = ((idx / bounds.height) << BIN_SIZE_SHIFT) + bounds.left;
          const y = (idx % bounds.height << BIN_SIZE_SHIFT) + bounds.top;
          const c = cts({ x: x, y: y });
          if (cells.has(c)) {
            const ct = map.unproject(
              [x + (1 << BIN_SIZE_SHIFT) / 2, y + (1 << BIN_SIZE_SHIFT) / 2],
              DEFAULT_ZOOM,
            );
            binSum += bin;
            binNum += 1;
            L.circle(L.latLng(ct), {
              fillColor: '#FF0000',
              fillOpacity: 0.75,
              radius: 24,
              stroke: false,
            })
              .bindTooltip(`${bin.toFixed(2)}`, { direction: 'top' })
              .addTo(mlayer)
              .on('click', e => {
                const cs = cells;
                if (cs.has(c)) {
                  cs.delete(c);
                } else {
                  cs.add(c);
                }
                // console.log(cs);
                setCells(new Set(cs));
              });
          }
        }
      });
      setOverlayData(binSum / binNum);
    })();
  }, [
    cells,
    setCells,
    setOverlayData,
    bins,
    selectedSites,
    mapType,
    setLoading,
    map,
    mlayer,
    bounds,
    layer,
  ]);

  return (
    <div style={{ position: 'relative', top: top }}>
      <div
        id='map-id'
        style={{ height, width, position: 'absolute', zIndex: '1' }}
      ></div>
      <div style={{ position: 'fixed', right: 0, zIndex: '1' }}>
        <MapLegend
          colorDomain={cDomain}
          title={`${MAP_TYPE_CONVERT[mapType]} (${UNITS[mapType]})`}
          width={LEGEND_WIDTH}
        ></MapLegend>
      </div>
      <Loading left={width / 2} top={height / 2} size={70} loading={loading} />
    </div>
  );
};

export default MeasurementMap;
