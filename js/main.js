const NS = "http://www.battlescribe.net/schema/catalogueSchema";
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.4;
const INITIAL_EXPANDED_IDS = new Set([
  "lion-root",
  "supreme-command",
  "deathwing",
  "ravenwing",
  "sealed-archive"
]);

const wingColors = {
  Deathwing: "#d5c6a3",
  Ravenwing: "#6f1c20",
  "Inner Circle": "#2e6b4d",
  "Sealed Archive": "#2e6b4d",
  Command: "#ad8451",
  Group: "#6e746c",
  Default: "#6e746c"
};

const assetFiles = [
  "asmodai.webp",
  "azrael.webp",
  "belial.webp",
  "black-knight.webp",
  "dark-angels-battle.webp",
  "dark-angels-captain.webp",
  "dark-angels-legion.webp",
  "darkshroud.webp",
  "dark-talon.webp",
  "deathwing-knight.webp",
  "deathwing-terminator-squad.webp",
  "ezekiel.webp",
  "innercircle-companion.jpg",
  "Inner_Circle.webp",
  "land-speeder-vengeance.webp",
  "lazarus.webp",
  "lion-eljonson.webp",
  "nephilim-jetfighter.webp",
  "ravenwing-blackknights.webp",
  "ravenwing-commandsquad.jpg",
  "ravenwing-darkshroud.jpg",
  "ravenwing-standard.webp",
  "sammael.webp",
  "terminator-squad.webp"
];

const assetAliases = {
  innercirclecompanions: "innercirclecompanion",
  ravenwingdarktalon: "darktalon"
};

const preferredNodeImageKeys = {
  "lion-root": "lion-eljonson",
  "supreme-command": "dark-angels-captain",
  "chapter-masters": "azrael",
  "inner-circle-advisors": "Inner_Circle",
  deathwing: "deathwing-knight",
  "deathwing-grand-master": "belial",
  "deathwing-strike-formations": "deathwing-terminator-squad",
  ravenwing: "ravenwing-blackknights",
  "ravenwing-grand-master": "sammael",
  "ravenwing-hunt-packs": "ravenwing-blackknights",
  "ravenwing-war-engines": "nephilim-jetfighter",
  "sealed-archive": "dark-angels-legion",
  "deathwing-reliquary": "deathwing-terminator-squad",
  "ravenwing-reliquary": "ravenwing-standard"
};

const assetIndex = Object.fromEntries(
  assetFiles.map((fileName) => [normalizeAssetKey(fileName), `assets/${fileName}`])
);

const state = {
  units: [],
  rootData: null,
  selectedNodeId: "lion-root",
  treeSvg: null,
  treeDefs: null,
  treeViewport: null,
  treeLinkLayer: null,
  treeNodeLayer: null,
  zoomBehavior: null,
  zoomTransform: d3.zoomIdentity,
  viewportWidth: 0,
  viewportHeight: 0,
  treeBounds: null,
  hasFittedView: false
};

const elements = {
  cataloguePill: document.getElementById("catalogue-pill"),
  archiveCaption: document.getElementById("archive-caption"),
  unitsStat: document.getElementById("units-stat"),
  charactersStat: document.getElementById("characters-stat"),
  deathwingStat: document.getElementById("deathwing-stat"),
  ravenwingStat: document.getElementById("ravenwing-stat"),
  vehiclesStat: document.getElementById("vehicles-stat"),
  chapterTree: document.getElementById("chapter-tree"),
  detailCard: document.getElementById("detail-card"),
  tooltip: document.getElementById("tooltip"),
  treeZoom: document.getElementById("tree-zoom"),
  zoomReadout: document.getElementById("zoom-readout"),
  treeReset: document.getElementById("tree-reset")
};

function stripMarkup(value) {
  const fragment = document.createElement("div");
  fragment.innerHTML = value ?? "";
  return fragment.textContent.replace(/\s+/g, " ").trim();
}

function parseLeadingNumber(value) {
  const match = /-?\d+(\.\d+)?/.exec(value ?? "");
  return match ? Number(match[0]) : null;
}

function normalizeAssetKey(value) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s*\[legends\]\s*/gi, "")
    .replace(/[^a-z0-9]+/g, "");
}

function firstMatchingAsset(candidates) {
  for (const candidate of candidates) {
    const key = normalizeAssetKey(candidate);
    const resolvedKey = assetAliases[key] ?? key;
    if (assetIndex[resolvedKey]) {
      return assetIndex[resolvedKey];
    }
  }

  return null;
}

function childrenByName(node, name) {
  return Array.from(node?.children ?? []).filter((child) => child.localName === name);
}

function firstChildByName(node, name) {
  return childrenByName(node, name)[0] ?? null;
}

function uniqueProfiles(selectionEntry, typeName) {
  const profiles = Array.from(selectionEntry.getElementsByTagNameNS(NS, "profile")).filter(
    (profile) => profile.getAttribute("typeName") === typeName
  );
  const unique = new Map();

  profiles.forEach((profile) => {
    const name = profile.getAttribute("name");
    if (!unique.has(name)) {
      unique.set(name, profile);
    }
  });

  return Array.from(unique.values());
}

function profileCharacteristics(profile) {
  return Array.from(profile.getElementsByTagNameNS(NS, "characteristic")).reduce((result, characteristic) => {
    result[characteristic.getAttribute("name")] = (characteristic.textContent ?? "").trim();
    return result;
  }, {});
}

function deriveWing(categories, name) {
  if (name === "Lion El'Jonson") {
    return "Inner Circle";
  }

  if (categories.includes("Ravenwing")) {
    return "Ravenwing";
  }

  if (categories.includes("Deathwing")) {
    return "Deathwing";
  }

  if (categories.includes("Character")) {
    return "Command";
  }

  return "Command";
}

function deriveRole(categories, entryType) {
  if (categories.includes("Character")) {
    return "Character";
  }

  if (categories.includes("Aircraft")) {
    return "Aircraft";
  }

  if (categories.includes("Vehicle")) {
    return "Vehicle";
  }

  if (categories.includes("Mounted")) {
    return "Mounted";
  }

  if (categories.includes("Infantry")) {
    return "Infantry";
  }

  return entryType === "unit" ? "Squad" : "Asset";
}

function parseSelectionEntry(selectionEntry) {
  const name = selectionEntry.getAttribute("name") ?? "Unknown Entry";
  const entryType = selectionEntry.getAttribute("type") ?? "model";
  const categories = childrenByName(firstChildByName(selectionEntry, "categoryLinks"), "categoryLink").map(
    (link) => link.getAttribute("name")
  );

  const unitProfile = uniqueProfiles(selectionEntry, "Unit")[0] ?? null;
  const stats = unitProfile ? profileCharacteristics(unitProfile) : {};
  const abilities = uniqueProfiles(selectionEntry, "Abilities").map((profile) => {
    const description = Array.from(profile.getElementsByTagNameNS(NS, "characteristic"))[0]?.textContent ?? "";
    return {
      name: profile.getAttribute("name"),
      description: stripMarkup(description)
    };
  });

  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    entryType,
    legends: name.includes("[Legends]"),
    categories,
    wing: deriveWing(categories, name),
    role: deriveRole(categories, entryType),
    stats,
    mobility: parseLeadingNumber(stats.M),
    toughness: parseLeadingNumber(stats.T),
    wounds: parseLeadingNumber(stats.W),
    objectiveControl: parseLeadingNumber(stats.OC),
    abilities,
    rangedWeapons: uniqueProfiles(selectionEntry, "Ranged Weapons").map((profile) => profile.getAttribute("name")),
    meleeWeapons: uniqueProfiles(selectionEntry, "Melee Weapons").map((profile) => profile.getAttribute("name"))
  };
}

function parseCatalogue(xmlDocument) {
  const root = xmlDocument.documentElement;
  const sharedSelectionEntries = xmlDocument.getElementsByTagNameNS(NS, "sharedSelectionEntries")[0];
  const publication = xmlDocument.getElementsByTagNameNS(NS, "publication")[0];
  const entries = childrenByName(sharedSelectionEntries, "selectionEntry").map(parseSelectionEntry);

  return {
    name: root.getAttribute("name") ?? "Dark Angels Catalogue",
    revision: root.getAttribute("revision") ?? "",
    publicationDate: publication?.getAttribute("publicationDate") ?? "",
    units: entries
  };
}

function branchDescription(branchName) {
  const descriptions = {
    "Supreme Command":
      "The visible ruling hand of the Chapter: masters, chaplains, librarians, and trusted captains who carry the Lion's will into war.",
    Deathwing:
      "The bone-armoured veteran brotherhood: inner keepers of the Chapter's oldest burdens and the mailed fist of its elite assaults.",
    Ravenwing:
      "The black hunt in motion: outriders, speeders, aircraft, and relentless pursuers who encircle and isolate the prey.",
    "Sealed Archive":
      "A warded reliquary for legacy formations and older command records preserved at the edges of the Chapter's living order."
  };

  return descriptions[branchName] ?? "A branch within the Dark Angels archive.";
}

function groupDescription(groupName) {
  const descriptions = {
    "Chapter Masters":
      "Senior battlefield leaders and exemplars of the Chapter's knightly command traditions.",
    "Inner Circle Advisors":
      "Spiritual and psychic authorities who shape doctrine, judgement, and hidden purpose.",
    "Grand Master":
      "The field leader whose authority gives shape to the branch beneath him.",
    "Strike Formations":
      "Core elite formations committed to close assault, boarding action, and stubborn line-holding.",
    "Hunt Packs":
      "Fast-moving Ravenwing formations built for pursuit, interdiction, and sudden violence.",
    "War Engines":
      "Aircraft, speeders, and heavy assets that extend the reach of the hunt.",
    "Deathwing Reliquary":
      "Older Deathwing records preserved as part of the sealed archive.",
    "Ravenwing Reliquary":
      "Legacy Ravenwing command records preserved outside the active order."
  };

  return descriptions[groupName] ?? "A sub-group inside the Chapter archive.";
}

function buildUnitLeaf(unit, branchWing, descriptionOverride = null) {
  return {
    id: unit.id,
    name: unit.name,
    type: "unit",
    wing: branchWing,
    description: descriptionOverride ?? `${unit.role}${unit.legends ? " / Legends" : ""}`,
    count: 1,
    unit
  };
}

function buildGroupNode(id, name, wing, children) {
  return {
    id,
    name,
    type: "group",
    wing,
    description: groupDescription(name),
    children
  };
}

function finalizeCounts(dataNode) {
  if (!dataNode.children?.length) {
    dataNode.count = dataNode.type === "unit" ? 1 : dataNode.count ?? 0;
    return dataNode;
  }

  dataNode.children = dataNode.children
    .filter(Boolean)
    .map((child) => finalizeCounts(child));
  dataNode.count = dataNode.children.reduce((total, child) => total + (child.count ?? 0), 0);
  return dataNode;
}

function buildHierarchy(units) {
  const unitsByName = new Map(units.map((unit) => [unit.name, unit]));
  const lion = unitsByName.get("Lion El'Jonson") ?? null;

  const getUnit = (name) => unitsByName.get(name) ?? null;
  const leaf = (name, wing, descriptionOverride = null) => {
    const unit = getUnit(name);
    return unit ? buildUnitLeaf(unit, wing, descriptionOverride) : null;
  };

  const root = {
    id: "lion-root",
    name: "Lion El'Jonson",
    type: "root",
    wing: "Inner Circle",
    description:
      "Primarch of the First Legion. This archive tree reads the Dark Angels not as a complete Codex structure, but as a curated record of named Dark Angels-specific command figures, formations, and relic assets.",
    unit: lion,
    children: [
      {
        id: "supreme-command",
        name: "Supreme Command",
        type: "wing",
        wing: "Command",
        description: branchDescription("Supreme Command"),
        children: [
          buildGroupNode("chapter-masters", "Chapter Masters", "Command", [
            leaf("Azrael", "Command", "Supreme Grand Master / Chapter Master"),
            leaf("Lazarus", "Command", "Captain / Field Commander")
          ]),
          buildGroupNode("inner-circle-advisors", "Inner Circle Advisors", "Command", [
            leaf("Ezekiel", "Command", "Chief Librarian / Inner Circle"),
            leaf("Asmodai", "Command", "Interrogator-Chaplain")
          ])
        ]
      },
      {
        id: "deathwing",
        name: "Deathwing",
        type: "wing",
        wing: "Deathwing",
        description: branchDescription("Deathwing"),
        children: [
          buildGroupNode("deathwing-grand-master", "Grand Master", "Deathwing", [
            leaf("Belial", "Deathwing", "Grand Master of the Deathwing")
          ]),
          buildGroupNode("deathwing-strike-formations", "Strike Formations", "Deathwing", [
            leaf("Deathwing Knights", "Deathwing"),
            leaf("Deathwing Terminator Squad", "Deathwing"),
            leaf("Inner Circle Companions", "Deathwing", "Inner Circle Retinue / Infantry")
          ])
        ]
      },
      {
        id: "ravenwing",
        name: "Ravenwing",
        type: "wing",
        wing: "Ravenwing",
        description: branchDescription("Ravenwing"),
        children: [
          buildGroupNode("ravenwing-grand-master", "Grand Master", "Ravenwing", [
            leaf("Sammael", "Ravenwing", "Grand Master of the Ravenwing")
          ]),
          buildGroupNode("ravenwing-hunt-packs", "Hunt Packs", "Ravenwing", [
            leaf("Ravenwing Black Knights", "Ravenwing"),
            leaf("Ravenwing Command Squad", "Ravenwing")
          ]),
          buildGroupNode("ravenwing-war-engines", "War Engines", "Ravenwing", [
            leaf("Nephilim Jetfighter", "Ravenwing"),
            leaf("Ravenwing Dark Talon", "Ravenwing"),
            leaf("Land Speeder Vengeance", "Ravenwing"),
            leaf("Ravenwing Darkshroud", "Ravenwing")
          ])
        ]
      },
      {
        id: "sealed-archive",
        name: "Sealed Archive",
        type: "wing",
        wing: "Sealed Archive",
        description: branchDescription("Sealed Archive"),
        children: [
          buildGroupNode("deathwing-reliquary", "Deathwing Reliquary", "Sealed Archive", [
            leaf("Deathwing Strikemaster [Legends]", "Sealed Archive", "Legacy Deathwing Officer / Legends"),
            leaf("Deathwing Command Squad [Legends]", "Sealed Archive", "Legacy Deathwing Formation / Legends")
          ]),
          buildGroupNode("ravenwing-reliquary", "Ravenwing Reliquary", "Sealed Archive", [
            leaf("Ravenwing Talonmaster [Legends]", "Sealed Archive", "Legacy Ravenwing Officer / Legends")
          ])
        ]
      }
    ]
  };

  return finalizeCounts(root);
}

function collapseTreeByDefault(dataNode, expandedIds = INITIAL_EXPANDED_IDS) {
  const children = (dataNode.children ?? []).map((child) => collapseTreeByDefault(child, expandedIds));

  if (!children.length) {
    dataNode.children = undefined;
    dataNode._children = undefined;
    dataNode.collapsed = false;
    return dataNode;
  }

  if (expandedIds.has(dataNode.id)) {
    dataNode.children = children;
    dataNode._children = undefined;
    dataNode.collapsed = false;
    return dataNode;
  }

  dataNode.children = undefined;
  dataNode._children = children;
  dataNode.collapsed = true;
  return dataNode;
}

function allChildren(dataNode) {
  return [...(dataNode.children ?? []), ...(dataNode._children ?? [])];
}

function hasNestedChildren(dataNode) {
  return allChildren(dataNode).length > 0;
}

function countDescendantUnits(dataNode) {
  if (dataNode.type === "unit") {
    return 1;
  }

  return allChildren(dataNode).reduce((total, child) => total + countDescendantUnits(child), 0);
}

function findNodeById(dataNode, id) {
  if (dataNode.id === id) {
    return dataNode;
  }

  for (const child of allChildren(dataNode)) {
    const result = findNodeById(child, id);
    if (result) {
      return result;
    }
  }

  return null;
}

function nodeContainsId(dataNode, id) {
  if (dataNode.id === id) {
    return true;
  }

  return allChildren(dataNode).some((child) => nodeContainsId(child, id));
}

function toggleNodeExpansion(dataNode) {
  if (dataNode._children?.length) {
    dataNode.children = dataNode._children;
    dataNode._children = undefined;
    dataNode.collapsed = false;
    return "expanded";
  }

  if (dataNode.children?.length) {
    dataNode._children = dataNode.children;
    dataNode.children = undefined;
    dataNode.collapsed = true;
    return "collapsed";
  }

  return "leaf";
}

function updateSummary(units, catalogue) {
  const currentUnits = units.filter((unit) => !unit.legends);
  const characterCount = currentUnits.filter((unit) => unit.categories.includes("Character")).length;
  const deathwingCount = currentUnits.filter((unit) => unit.wing === "Deathwing").length;
  const ravenwingCount = currentUnits.filter((unit) => unit.wing === "Ravenwing").length;
  const vehicleCount = currentUnits.filter(
    (unit) => unit.categories.includes("Vehicle") || unit.categories.includes("Aircraft")
  ).length;

  elements.unitsStat.textContent = String(currentUnits.length);
  elements.charactersStat.textContent = String(characterCount);
  elements.deathwingStat.textContent = String(deathwingCount);
  elements.ravenwingStat.textContent = String(ravenwingCount);
  elements.vehiclesStat.textContent = String(vehicleCount);
  elements.cataloguePill.textContent = `${catalogue.name} / revision ${catalogue.revision}`;
  elements.archiveCaption.textContent = `This archive tree reorganizes ${units.length} Dark Angels entries into a lore-driven structure: Lion El'Jonson at the root, then Supreme Command, Deathwing, Ravenwing, and a Sealed Archive for Legends-era records.`;
}

function nodeFill(node) {
  if (node.data.type === "root") {
    return wingColors.Command;
  }

  if (node.data.type === "group") {
    return wingColors.Group;
  }

  return wingColors[node.data.wing] ?? wingColors.Default;
}

function unitImageHref(unit) {
  const matched = firstMatchingAsset([
    unit.id,
    unit.name,
    unit.name.replace(/\s*\[Legends\]/i, ""),
    unit.wing,
    unit.role
  ]);

  if (matched) {
    return matched;
  }

  if (unit.wing === "Deathwing") {
    return "assets/deathwing-knight.webp";
  }

  if (unit.wing === "Ravenwing") {
    return "assets/ravenwing-blackknights.webp";
  }

  if (unit.wing === "Command") {
    return "assets/dark-angels-captain.webp";
  }

  return "assets/dark-angels-battle.webp";
}

function nodeImageHref(dataNode) {
  if (dataNode.unit) {
    return unitImageHref(dataNode.unit);
  }

  const matched = firstMatchingAsset([
    preferredNodeImageKeys[dataNode.id],
    dataNode.id,
    dataNode.name,
    dataNode.name.replace(/\s*\[Legends\]/i, "")
  ]);

  if (matched) {
    return matched;
  }

  if (dataNode.wing === "Deathwing") {
    return "assets/deathwing-knight.webp";
  }

  if (dataNode.wing === "Ravenwing") {
    return "assets/ravenwing-blackknights.webp";
  }

  if (dataNode.wing === "Command") {
    return "assets/dark-angels-captain.webp";
  }

  if (dataNode.wing === "Sealed Archive") {
    return "assets/dark-angels-legion.webp";
  }

  return "assets/dark-angels-battle.webp";
}

function patternIdForNode(dataNode) {
  return `node-pattern-${dataNode.id}`;
}

function linkClass(node) {
  const wing = node.data.wing ?? "group";
  const normalized = wing.toLowerCase().replace(/\s+/g, "-");
  return `tree-link branch-${normalized}`;
}

function radiusForNode(node) {
  if (node.data.type === "root") {
    return 42;
  }

  if (node.data.type === "wing") {
    return 34;
  }

  if (node.data.type === "group") {
    return 26;
  }

  return 20;
}

function visibleNodeSubtitle(dataNode) {
  if (dataNode.type === "unit") {
    return dataNode.description;
  }

  if (dataNode.type === "root") {
    return dataNode.children?.length ? "Primarch root / click to fold the archive" : "Primarch root / click to reopen";
  }

  const collapsed = Boolean(dataNode._children?.length && !dataNode.children?.length);
  return `${dataNode.count} entries / ${collapsed ? "collapsed" : "open"}`;
}

function showTooltip(event, node) {
  const countText = node.data.type === "unit" ? node.data.description : `${node.data.count} entries`;
  const interactionText = node.data.type === "unit" ? "Click to inspect the dossier." : "Click to open or fold this archive branch.";
  elements.tooltip.hidden = false;
  elements.tooltip.innerHTML = `
    <strong>${node.data.name}</strong>
    <p>${countText}</p>
    <p>${interactionText}</p>
  `;
  elements.tooltip.style.left = `${event.clientX + 18}px`;
  elements.tooltip.style.top = `${event.clientY + 18}px`;
}

function hideTooltip() {
  elements.tooltip.hidden = true;
}

function updateZoomUi(scale) {
  if (elements.treeZoom) {
    elements.treeZoom.value = String(Math.round(scale * 100) / 100);
  }

  if (elements.zoomReadout) {
    elements.zoomReadout.textContent = `${Math.round(scale * 100)}%`;
  }
}

function treeViewportCenter() {
  return [state.viewportWidth / 2, state.viewportHeight / 2];
}

function fitTransformForBounds() {
  if (!state.treeBounds) {
    return d3.zoomIdentity;
  }

  const width = Math.max(state.viewportWidth, 1);
  const height = Math.max(state.viewportHeight, 1);
  const paddingX = 96;
  const paddingY = 80;
  const contentWidth = Math.max(state.treeBounds.maxY - state.treeBounds.minY, 1);
  const contentHeight = Math.max(state.treeBounds.maxX - state.treeBounds.minX, 1);
  const fitScale = Math.min(
    (width - paddingX * 2) / contentWidth,
    (height - paddingY * 2) / contentHeight
  );
  const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitScale));
  const translateX = (width - contentWidth * scale) / 2 - state.treeBounds.minY * scale;
  const translateY = (height - contentHeight * scale) / 2 - state.treeBounds.minX * scale;

  return d3.zoomIdentity.translate(translateX, translateY).scale(scale);
}

function fitTreeToViewport(animate = false) {
  if (!state.treeSvg || !state.zoomBehavior || !state.treeBounds) {
    return;
  }

  const targetTransform = fitTransformForBounds();

  if (animate) {
    state.treeSvg.transition().duration(380).call(state.zoomBehavior.transform, targetTransform);
  } else {
    state.treeSvg.call(state.zoomBehavior.transform, targetTransform);
  }

  state.hasFittedView = true;
}

function zoomToScale(targetScale) {
  if (!state.treeSvg || !state.zoomBehavior) {
    return;
  }

  const clampedScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetScale));
  state.treeSvg.call(state.zoomBehavior.scaleTo, clampedScale, treeViewportCenter());
}

function ensureTreeScene() {
  if (state.treeSvg) {
    return;
  }

  elements.chapterTree.innerHTML = "";

  state.treeSvg = d3
    .select(elements.chapterTree)
    .append("svg")
    .attr("class", "chart-svg")
    .attr("role", "img")
    .attr("aria-label", "A hierarchical tree of Dark Angels chapter structure from Lion El'Jonson down to named formations and units");

  state.treeDefs = state.treeSvg.append("defs");
  state.treeViewport = state.treeSvg.append("g").attr("class", "tree-viewport");
  state.treeLinkLayer = state.treeViewport.append("g").attr("class", "tree-links");
  state.treeNodeLayer = state.treeViewport.append("g").attr("class", "tree-nodes");

  state.zoomBehavior = d3
    .zoom()
    .filter((event) => event.type !== "wheel" && !event.button)
    .scaleExtent([ZOOM_MIN, ZOOM_MAX])
    .on("start", () => {
      elements.chapterTree.classList.add("is-dragging");
    })
    .on("end", () => {
      elements.chapterTree.classList.remove("is-dragging");
    })
    .on("zoom", (event) => {
      state.zoomTransform = event.transform;
      state.treeViewport.attr("transform", event.transform);
      updateZoomUi(event.transform.k);
    });

  state.treeSvg.call(state.zoomBehavior).on("dblclick.zoom", null);
}

function computeTreeBounds(nodes) {
  return {
    minX: d3.min(nodes, (node) => node.x - radiusForNode(node) - 30) ?? 0,
    maxX: d3.max(nodes, (node) => node.x + radiusForNode(node) + 30) ?? 0,
    minY: d3.min(nodes, (node) => node.y - radiusForNode(node) - 32) ?? 0,
    maxY:
      d3.max(nodes, (node) => {
        const radius = radiusForNode(node);
        const labelWidth = Math.min(320, node.data.name.length * 8 + 84);
        return node.y + radius + 18 + labelWidth;
      }) ?? 0
  };
}

function renderTree(sourceId = state.selectedNodeId, options = {}) {
  ensureTreeScene();

  if (!state.rootData) {
    return;
  }

  state.viewportWidth = Math.max(elements.chapterTree.clientWidth, 720);
  state.viewportHeight = Math.max(elements.chapterTree.clientHeight, 720);

  state.treeSvg
    .attr("width", state.viewportWidth)
    .attr("height", state.viewportHeight)
    .attr("viewBox", `0 0 ${state.viewportWidth} ${state.viewportHeight}`);

  const hierarchyRoot = d3.hierarchy(state.rootData, (dataNode) => dataNode.children);
  const treeLayout = d3.tree().nodeSize([148, 330]);
  treeLayout(hierarchyRoot);

  const nodes = hierarchyRoot.descendants();
  const xExtent = d3.extent(nodes, (node) => node.x);
  const yExtent = d3.extent(nodes, (node) => node.y);

  nodes.forEach((node) => {
    node.x = node.x - xExtent[0] + 100;
    node.y = node.y - yExtent[0] + 120;
  });

  state.treeBounds = computeTreeBounds(nodes);
  state.zoomBehavior
    .extent([
      [0, 0],
      [state.viewportWidth, state.viewportHeight]
    ])
    .translateExtent([
      [state.treeBounds.minY - 280, state.treeBounds.minX - 220],
      [state.treeBounds.maxY + 280, state.treeBounds.maxX + 220]
    ]);

  const sourceData = findNodeById(state.rootData, sourceId) ?? state.rootData;
  const sourcePosition = {
    x: sourceData.x0 ?? nodes[0].x,
    y: sourceData.y0 ?? nodes[0].y
  };
  const transition = d3.transition().duration(520).ease(d3.easeCubicInOut);
  const visibleLinks = hierarchyRoot.links();

  const patterns = state.treeDefs
    .selectAll("pattern.node-pattern")
    .data(nodes, (node) => node.data.id)
    .join(
      (enter) => {
        const pattern = enter.append("pattern").attr("class", "node-pattern");
        pattern.append("image");
        return pattern;
      },
      (update) => update,
      (exit) => exit.remove()
    )
    .attr("id", (node) => patternIdForNode(node.data))
    .attr("patternUnits", "userSpaceOnUse")
    .attr("patternContentUnits", "userSpaceOnUse")
    .attr("width", (node) => radiusForNode(node) * 2)
    .attr("height", (node) => radiusForNode(node) * 2);

  patterns
    .select("image")
    .attr("href", (node) => nodeImageHref(node.data))
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", (node) => radiusForNode(node) * 2)
    .attr("height", (node) => radiusForNode(node) * 2)
    .attr("preserveAspectRatio", "xMidYMid slice");

  const linkPath = d3
    .linkHorizontal()
    .x((linkNode) => linkNode.y)
    .y((linkNode) => linkNode.x);

  const linkSelection = state.treeLinkLayer.selectAll("path.tree-link").data(visibleLinks, (link) => link.target.data.id);

  const enteringLinks = linkSelection
    .enter()
    .append("path")
    .attr("class", (link) => linkClass(link.target))
    .attr("d", () =>
      linkPath({
        source: sourcePosition,
        target: sourcePosition
      })
    );

  enteringLinks
    .merge(linkSelection)
    .attr("class", (link) => linkClass(link.target))
    .transition(transition)
    .attr("d", (link) => linkPath(link));

  linkSelection
    .exit()
    .transition(transition)
    .attr("d", () =>
      linkPath({
        source: sourcePosition,
        target: sourcePosition
      })
    )
    .remove();

  const nodeSelection = state.treeNodeLayer.selectAll("g.tree-node").data(nodes, (node) => node.data.id);

  const enteringNodes = nodeSelection
    .enter()
    .append("g")
    .attr("class", "tree-node")
    .attr("transform", `translate(${sourcePosition.y},${sourcePosition.x})`);

  enteringNodes.append("circle").attr("class", "node-shell").attr("r", 0);
  enteringNodes.append("circle").attr("class", "node-core").attr("r", 0);
  const enteringToggleGroups = enteringNodes.append("g").attr("class", "node-toggle");
  enteringToggleGroups.append("circle").attr("class", "node-toggle-hit").attr("r", 0);
  enteringToggleGroups.append("circle").attr("class", "node-toggle-shell").attr("r", 0);
  enteringToggleGroups.append("text").attr("class", "node-toggle-symbol").attr("opacity", 0);
  enteringNodes.append("text").attr("class", "node-label").attr("opacity", 0);
  enteringNodes.append("text").attr("class", "node-sub").attr("opacity", 0);

  const mergedNodes = enteringNodes.merge(nodeSelection);

  mergedNodes
    .attr("data-node-id", (node) => node.data.id)
    .classed("is-selected", (node) => node.data.id === state.selectedNodeId)
    .classed("is-collapsed", (node) => Boolean(node.data._children?.length && !node.data.children?.length))
    .classed("is-expandable", (node) => hasNestedChildren(node.data))
    .on("mouseenter", (event, node) => showTooltip(event, node))
    .on("mousemove", (event, node) => showTooltip(event, node))
    .on("mouseleave", hideTooltip)
    .on("click", (event, node) => {
      event.stopPropagation();
      state.selectedNodeId = node.data.id;
      renderTree(node.data.id);
      renderDetailCard();
    });

  mergedNodes
    .select(".node-toggle")
    .style("pointer-events", (node) => (hasNestedChildren(node.data) ? "all" : "none"))
    .on("click", (event, node) => {
      if (!hasNestedChildren(node.data)) {
        return;
      }

      event.stopPropagation();
      const previousSelectionId = state.selectedNodeId;
      const result = toggleNodeExpansion(node.data);

      if (result === "collapsed" && previousSelectionId !== node.data.id && nodeContainsId(node.data, previousSelectionId)) {
        state.selectedNodeId = node.data.id;
      }

      renderTree(node.data.id);
      renderDetailCard();
    });

  mergedNodes
    .transition(transition)
    .attr("transform", (node) => `translate(${node.y},${node.x})`);

  mergedNodes
    .select(".node-shell")
    .transition(transition)
    .attr("r", (node) => radiusForNode(node) + 4)
    .attr("fill", (node) => nodeFill(node));

  mergedNodes
    .select(".node-core")
    .transition(transition)
    .attr("r", (node) => radiusForNode(node))
    .attr("fill", (node) => `url(#${patternIdForNode(node.data)})`);

  mergedNodes
    .select(".node-toggle")
    .transition(transition)
    .attr("transform", (node) => `translate(${radiusForNode(node) * 0.82},${-radiusForNode(node) * 0.82})`);

  mergedNodes
    .select(".node-toggle-hit")
    .transition(transition)
    .attr("r", (node) => (hasNestedChildren(node.data) ? 16 : 0));

  mergedNodes
    .select(".node-toggle-shell")
    .transition(transition)
    .attr("cx", 0)
    .attr("cy", 0)
    .attr("r", (node) => (hasNestedChildren(node.data) ? 12.5 : 0));

  mergedNodes
    .select(".node-toggle-symbol")
    .text((node) => {
      if (!hasNestedChildren(node.data)) {
        return "";
      }

      return node.data._children?.length ? "+" : "-";
    })
    .transition(transition)
    .attr("x", 0)
    .attr("y", 1)
    .attr("opacity", (node) => (hasNestedChildren(node.data) ? 1 : 0));

  mergedNodes
    .select(".node-label")
    .text((node) => node.data.name)
    .transition(transition)
    .attr("x", (node) => radiusForNode(node) + 16)
    .attr("y", -4)
    .attr("opacity", 1);

  mergedNodes
    .select(".node-sub")
    .text((node) => visibleNodeSubtitle(node.data))
    .transition(transition)
    .attr("x", (node) => radiusForNode(node) + 16)
    .attr("y", 14)
    .attr("opacity", 1);

  const exitingNodes = nodeSelection.exit();

  exitingNodes
    .select(".node-shell")
    .transition(transition)
    .attr("r", 0);

  exitingNodes
    .select(".node-core")
    .transition(transition)
    .attr("r", 0);

  exitingNodes
    .select(".node-toggle-hit")
    .transition(transition)
    .attr("r", 0);

  exitingNodes
    .select(".node-toggle-shell")
    .transition(transition)
    .attr("r", 0);

  exitingNodes
    .selectAll("text")
    .transition(transition)
    .attr("opacity", 0);

  exitingNodes
    .transition(transition)
    .attr("transform", `translate(${sourcePosition.y},${sourcePosition.x})`)
    .remove();

  nodes.forEach((node) => {
    node.data.x0 = node.x;
    node.data.y0 = node.y;
  });

  if (options.fitView || !state.hasFittedView) {
    fitTreeToViewport(options.fitView && state.hasFittedView);
  }
}

function statMarkup(label, value) {
  return `
    <article class="stat-pill">
      <span>${label}</span>
      <strong>${value ?? "--"}</strong>
    </article>
  `;
}

function badgeMarkup(value) {
  return `<span class="badge">${value}</span>`;
}

function detailHeroMarkup(imagePath, title) {
  return `
    <figure class="detail-hero">
      <img src="${imagePath}" alt="${title}">
    </figure>
  `;
}

function renderUnitDetail(unit) {
  const notableAbilities = unit.abilities.slice(0, 5);
  const visibleCategories = unit.categories.filter((category) => !category.startsWith("Faction:") && category !== unit.name);
  const imagePath = unitImageHref(unit);

  elements.detailCard.innerHTML = `
    <div class="detail-shell">
      ${detailHeroMarkup(imagePath, unit.name, `${unit.wing} / ${unit.role}${unit.legends ? " / Legends" : ""}`)}

      <div>
        <p class="section-label">Selected Entry</p>
        <h3>${unit.name}</h3>
        <p class="detail-meta">${unit.wing} / ${unit.role}${unit.legends ? " / Legends" : ""}</p>
      </div>

      <div class="detail-badges">
        ${badgeMarkup(unit.entryType)}
        ${badgeMarkup(unit.wing)}
        ${badgeMarkup(unit.role)}
      </div>

      <div class="detail-stats">
        ${statMarkup("M", unit.stats.M)}
        ${statMarkup("T", unit.stats.T)}
        ${statMarkup("SV", unit.stats.SV)}
        ${statMarkup("W", unit.stats.W)}
        ${statMarkup("LD", unit.stats.LD)}
        ${statMarkup("OC", unit.stats.OC)}
      </div>

      <section class="detail-section">
        <h3>Signature Abilities</h3>
        <ul class="detail-list">
          ${notableAbilities
            .map(
              (ability) => `
                <li>
                  <strong>${ability.name}</strong>
                  <span class="detail-copy">${ability.description || "No short description extracted from the archive."}</span>
                </li>
              `
            )
            .join("")}
        </ul>
      </section>

      <section class="detail-section">
        <h3>Arsenal</h3>
        <p class="detail-copy"><strong>Ranged:</strong> ${unit.rangedWeapons.join(", ") || "None listed"}</p>
        <p class="detail-copy"><strong>Melee:</strong> ${unit.meleeWeapons.join(", ") || "None listed"}</p>
      </section>

      <section class="detail-section">
        <h3>Keywords</h3>
        <div class="weapon-list">${visibleCategories.map(badgeMarkup).join("")}</div>
      </section>
    </div>
  `;
}

function renderBranchDetail(dataNode) {
  const count = countDescendantUnits(dataNode);
  const children = allChildren(dataNode).slice(0, 8);
  const imagePath = nodeImageHref(dataNode);

  elements.detailCard.innerHTML = `
    <div class="detail-shell">
      ${detailHeroMarkup(imagePath, dataNode.name, `${count} descendant entries`)}

      <div>
        <p class="section-label">Archive Node</p>
        <h3>${dataNode.name}</h3>
        <p class="detail-meta">${dataNode.description}</p>
      </div>

      <div class="detail-badges">
        ${badgeMarkup(dataNode.type)}
        ${badgeMarkup(`${count} descendant entries`)}
      </div>

      <section class="detail-section">
        <h3>Contained Branches</h3>
        <ul class="detail-list">
          ${children
            .map(
              (child) => `
                <li>
                  <strong>${child.name}</strong>
                  <span class="detail-copy">${child.description ?? "Part of the selected branch in the current hierarchy prototype."}</span>
                </li>
              `
            )
            .join("")}
        </ul>
      </section>
    </div>
  `;
}

function renderDetailCard() {
  const selected = findNodeById(state.rootData, state.selectedNodeId);

  if (!selected) {
    return;
  }

  if (selected.type === "unit" && selected.unit) {
    renderUnitDetail(selected.unit);
    return;
  }

  if (selected.type === "root" && selected.unit) {
    renderUnitDetail(selected.unit);
    return;
  }

  renderBranchDetail(selected);
}

function debounce(callback, delay) {
  let timeoutId = null;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

function setupTreeControls() {
  elements.treeZoom?.addEventListener("input", (event) => {
    zoomToScale(Number(event.target.value));
  });

  elements.treeReset?.addEventListener("click", () => {
    fitTreeToViewport(true);
  });
}

async function initialize() {
  try {
    const xmlDocument = await d3.xml("data/dark-angels.cat");
    const catalogue = parseCatalogue(xmlDocument);
    state.units = catalogue.units;
    state.rootData = collapseTreeByDefault(buildHierarchy(catalogue.units));

    updateSummary(catalogue.units, catalogue);
    setupTreeControls();
    renderTree(state.selectedNodeId, { fitView: true });
    renderDetailCard();

    window.addEventListener(
      "resize",
      debounce(() => {
        renderTree(state.selectedNodeId, { fitView: true });
      }, 140)
    );
  } catch (error) {
    console.error(error);
    elements.cataloguePill.textContent = "Archive load failed";
    elements.archiveCaption.textContent = "The XML catalogue could not be parsed. Make sure the project is running through a local server.";
    elements.chapterTree.innerHTML = `
      <div class="detail-empty">
        <h3>Catalogue Unavailable</h3>
        <p>Serve the project through a local server so the browser can fetch the Dark Angels archive.</p>
      </div>
    `;
  }
}

initialize();
