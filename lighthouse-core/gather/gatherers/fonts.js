/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Gatherer = require('./gatherer');
const fontFaceDescriptors = [
  'display',
  'family',
  'featureSettings',
  'stretch',
  'style',
  'unicodeRange',
  'variant',
  'weight',
];

/* eslint-env browser*/
function getAllLoadedFonts() {
  const getFont = fontFace => {
    const fontRule = {};
    fontFaceDescriptors.forEach(descriptor => {
      fontRule[descriptor] = fontFace[descriptor];
    });

    return fontRule;
  };

  return document.fonts.ready.then(() => {
    return Array.from(document.fonts).filter(fontFace => fontFace.status === 'loaded')
      .map(getFont);
  });
}

function getFontFaceFromStylesheets() {
  function getSheetsFontFaces(stylesheet) {
    const fontUrlRegex = 'url\\((?:")([^"]+)(?:"|\')\\)';
    const fontFaceRules = [];
    if (stylesheet.cssRules) {
      for (const rule of stylesheet.cssRules) {
        if (rule instanceof CSSFontFaceRule) {
          const fontsObject = {
            display: rule.style.fontDisplay || 'auto',
            family: rule.style.fontFamily.replace(/"|'/g, ''),
            stretch: rule.style.fontStretch || 'normal',
            style: rule.style.fontStyle || 'normal',
            weight: rule.style.fontWeight || 'normal',
            variant: rule.style.fontVariant || 'normal',
            unicodeRange: rule.style.unicodeRange || 'U+0-10FFFF',
            featureSettings: rule.style.featureSettings || 'normal',
            src: [],
          };

          if (rule.style.src) {
            const matches = rule.style.src.match(new RegExp(fontUrlRegex, 'g'));
            if (matches) {
              fontsObject.src = matches.map(match => {
                const res = new RegExp(fontUrlRegex).exec(match);
                return new URL(res[1], location.href).href;
              });
            }
          }

          fontFaceRules.push(fontsObject);
        }
      }
    }

    return fontFaceRules;
  }

  function loadStylesheetWithCORS(oldNode) {
    const newNode = oldNode.cloneNode(true);

    return new Promise(resolve => {
      newNode.addEventListener('load', function onload() {
        newNode.removeEventListener('load', onload);
        resolve(getFontFaceFromStylesheets());
      });
      newNode.crossOrigin = 'anonymous';
      oldNode.parentNode.insertBefore(newNode, oldNode);
      oldNode.remove();
    });
  }

  const fontFacePromises = [];
  // get all loaded stylesheets
  for (const stylesheet of document.styleSheets) {
    // Cross-origin stylesheets don't expose cssRules by default. We reload them with CORS headers.
    try {
      if (stylesheet.cssRules === null && stylesheet.href && stylesheet.ownerNode &&
        !stylesheet.ownerNode.crossOrigin) {
        fontFacePromises.push(loadStylesheetWithCORS(stylesheet.ownerNode));
      } else {
        fontFacePromises.push(Promise.resolve(getSheetsFontFaces(stylesheet)));
      }
    } catch (err) {
      fontFacePromises.push(loadStylesheetWithCORS(stylesheet.ownerNode));
    }
  }

  return Promise.all(fontFacePromises)
    .then(fontFaces => [].concat(...fontFaces));
}
/* eslint-env node */

class Fonts extends Gatherer {
  constructor() {
    super();

    this.stylesheetIds = [];
  }

  _findSameFontFamily(fontFace, fontFacesList) {
    return fontFacesList.find(fontItem => {
      return !fontFaceDescriptors.find(descriptor => {
        return fontFace[descriptor] !== fontItem[descriptor];
      });
    });
  }

  afterPass({driver}) {
    return Promise.all(
      [
        driver.evaluateAsync(`(()=>{`
          + `const fontFaceDescriptors=JSON.parse('${JSON.stringify(fontFaceDescriptors)}');`
          + `return (${getAllLoadedFonts.toString()})();})()`),
        driver.evaluateAsync(`(()=>{`
          + `const fontFaceDescriptors=JSON.parse('${JSON.stringify(fontFaceDescriptors)}');`
          + `return (${getFontFaceFromStylesheets.toString()})();})()`),
      ]
    ).then(([loadedFonts, fontFaces]) => {
      return loadedFonts.map(fontFace => {
        const fontFaceItem = this._findSameFontFamily(fontFace, fontFaces);
        fontFace.src = fontFaceItem.src || [];

        return fontFace;
      });
    });
  }
}

module.exports = Fonts;
