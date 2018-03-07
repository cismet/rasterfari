


exports.customConvertLayerPartToDoc = function getDocPathFromLayerPart(layerPart) {
    if (layerPart.startsWith('R')===true) {
        return  "./docs/bplaene_etrs/rechtsk/B" + layerPart.substring(1, layerPart.length) + ".tif";
    } else if (layerPart.startsWith('N')) {
        return  "./docs/bplaene_etrs/nicht_rechtsk/B" + layerPart.substring(1, layerPart.length) + ".tif";
    }
    else {
        return layerPart;
    }
};
