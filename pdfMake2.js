const express = require('express');
const pdfMakePrinter = require('pdfmake/src/printer');
const htmlToPdfmake = require('html-to-pdfmake');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const mongoose = require('mongoose');
const ArticuloNode = require('./models/ArticuloNode');
require('dotenv').config();

const app = express();
app.use(express.json());

// Configuración de fuentes
const fonts = {
  Roboto: {
    normal: 'fonts/Roboto-Regular.ttf',
    bold: 'fonts/Roboto-Medium.ttf',
    italics: 'fonts/Roboto-Italic.ttf',
    bolditalics: 'fonts/Roboto-MediumItalic.ttf',
  },
};

async function connectToDatabase() {
  try {
    const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?authSource=${process.env.AUTH_SOURCE}`;
    await mongoose.connect(uri); // Sin las opciones deprecadas
    console.log('Conexión exitosa a MongoDB');
  } catch (error) {
    console.error('Error al conectar a MongoDB:', error);
    process.exit(1); // Finaliza el proceso si no se puede conectar
  }
}

connectToDatabase();

const printer = new pdfMakePrinter(fonts);

// Variable para guardar el docDefinition de la primera pasada
let docDefinitionFirstPass;

// Función para simular el entorno DOM
function convertHtmlToPdfmake(html, options) {
  //console.log('Convirtiendo HTML a pdfMake...');
  const dom = new JSDOM(html);
  global.window = dom.window;
  global.document = dom.window.document;
  const result = htmlToPdfmake(html, options);
  //console.log('Resultado de la conversión:', JSON.stringify(result, null, 2));
  return result;
}

// Función para limpiar notas
function cleanArray(arr) {
  //console.log('Limpiando array de notas...');
  const result = arr.reduce((acc, item) => {
    if (Array.isArray(item)) {
      const cleanedSubArray = cleanArray(item);
      if (cleanedSubArray.length > 0) {
        acc.push(cleanedSubArray);
      }
    } else if (typeof item === 'object' && item !== null && item.text !== 'null') {
      acc.push(item);
    }
    return acc;
  }, []);
  //console.log('Resultado del array limpio:', JSON.stringify(result, null, 2));
  return result;
}

// Función para eliminar valores null o undefined
function removeNullOrUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== null && item !== undefined)
      .map((item) => removeNullOrUndefined(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj = {};
    Object.keys(obj).forEach((key) => {
      if (obj[key] !== null && obj[key] !== undefined) {
        newObj[key] = removeNullOrUndefined(obj[key]);
      }
    });
    return newObj;
  }
  return obj;
}

// Función para encontrar el abuelo con un nodeName específico
function findGrandparentWithNodeName(obj, value) {
    //console.log('Buscando elementos con nodeName:', value);
    let result = [];
    let visited = new Set();
  
    function search(obj, value, parent = null, grandparent = null) {
      if (typeof obj === 'object' && obj !== null) {
        if (visited.has(obj)) {
          return; // Evitar recursión infinita
        }
        visited.add(obj);
  
        if (obj.nodeName === value) {
          if (!result.includes(grandparent)) {
            result.push(grandparent);
          }
        }
        for (let key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // You might want to skip certain keys to avoid unnecessary traversal
            if (key.startsWith('_')) {
              continue;
            }
            search(obj[key], value, obj, parent);
          }
        }
      }
    }
  
    search(obj, value);
    //console.log('Elementos encontrados:', result);
    return result;
  }
  

// Función para verificar arrays
function verificadorDeArray(array1, array2) {
    //console.log('Verificando arrays...');
    //console.log('Tamaño de array1:', array1.length);
    //console.log('Tamaño de array2:', array2.length);
    const resultado = [];
    let indexArray1 = 0;
    let congelarIteraciones = 0;
  
    array2.forEach((subArray, index) => {
      //console.log(`Procesando subArray ${index}, tamaño: ${subArray.length}`);
      if (Array.isArray(subArray)) {
        const mappedItems = subArray.map((item) => {
          if (congelarIteraciones > 0) {
            congelarIteraciones--;
          } else {
            let contador = 1; // Ajustar según sea necesario
  
            if (contador > 1) {
              congelarIteraciones = contador - 1;
            }
            indexArray1++;
            //console.log('indexArray1 incrementado a:', indexArray1);
          }
          const mappedItem = {
            itemFromArray1: array1[indexArray1 - 1],
            itemFromArray2: item,
          };
          return mappedItem;
        });
        resultado.push(mappedItems);
      } else {
        console.warn('El valor no es un array:', subArray);
      }
    });
  
    //console.log('Resultado de verificación de arrays:', JSON.stringify(resultado, null, 2));
    return resultado;
  }

// Función para obtener el número de página más frecuente
function getMostFrequentPageNumber(data) {
  if (data) {
    const pageCount = {};

    data.forEach((item) => {
      pageCount[item.pageNumber] = (pageCount[item.pageNumber] || 0) + 1;
    });

    let mostFrequentPageNumber = null;
    let maxCount = 0;

    Object.keys(pageCount).forEach((key) => {
      const count = pageCount[+key];
      if (count > maxCount) {
        mostFrequentPageNumber = +key;
        maxCount = count;
      }
    });

    return mostFrequentPageNumber;
  }
  return null;
}

// Función para construir el footer del PDF
function buildStructure(dataArray, pageNumber) {
  //console.log(`Construyendo estructura del pie de página para la página ${pageNumber}...`);
  const result = {
    text: [],
    alignment: 'left',
    margin: [20, 0, 0, 20],
    fontSize: 9,
  };
  dataArray.forEach((item) => {
    if (item.pageNumber === pageNumber) {
      if (Array.isArray(item.text)) {
        item.text.forEach((textItem) => {
          if (textItem.nodeName === 'SUP') {
            result.text.push({ text: textItem.text, sup: true });
          } else {
            result.text.push(textItem.text);
          }
        });
        result.text.push('\n');
      } else if (typeof item.text === 'string') {
        result.text.push(item.text);
        result.text.push('\n');
      }
    }
  });
  //console.log('Estructura del pie de página:', JSON.stringify(result, null, 2));
  return result;
}

// Función para procesar las notas de contenido
function processContentNotas(modifiedPdfContent, notasLimpias) {
  //console.log('Procesando contenido de notas...');
  // Encontrar los elementos con 'SUP'
  const foundItems = findGrandparentWithNodeName(modifiedPdfContent, 'SUP');

  // Obtener posiciones
  foundItems.forEach((item) => {
    if (item.positions && item.positions.length > 0) {
      item.pageNumber = getMostFrequentPageNumber(item.positions);
    } else {
      item.pageNumber = 1; // Por defecto, página 1
    }
  });

  const datosCompletos = verificadorDeArray(foundItems, notasLimpias);

  const result = [];
datosCompletos.forEach((itemArray) => {
  itemArray.forEach((item) => {
    const pageNumber = item.itemFromArray1 && item.itemFromArray1.pageNumber ? item.itemFromArray1.pageNumber : 1;

    const transformedItem = {
      text: item.itemFromArray2.text,
      nodeName: item.itemFromArray2.nodeName,
      margin: item.itemFromArray2.margin,
      style: item.itemFromArray2.style,
      pageNumber: pageNumber,
    };
    result.push(transformedItem);
  });
});
  //console.log('Notas procesadas:', JSON.stringify(result, null, 2));
  return result;
}

// Función para generar el PDF
async function generatePDF(docDefinition, cont) {
    //console.log(`Generando PDF (pasada ${cont})...`);
    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
  
      // Suscribirse al evento 'data' para leer los datos del PDF
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
  
      // Suscribirse al evento 'end' para saber cuándo ha terminado la generación
      pdfDoc.on('end', () => {
        //console.log(`Pasada ${cont} del PDF completada.`);
        const result = Buffer.concat(chunks);
  
        // Guardar el PDF generado
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir);
          //console.log('Directorio "uploads" creado.');
        }
  
        let filePath;
        if (cont === 1) {
          // En la primera pasada, guardamos el PDF como 'document_first_pass.pdf'
          filePath = path.join(uploadDir, 'document_first_pass.pdf');
          //console.log('Guardando PDF de la primera pasada en:', filePath);
  
          fs.writeFile(filePath, result, (err) => {
            if (err) {
              console.error('Error guardando el archivo de la primera pasada:', err);
              return reject(err);
            }
  
            //console.log('PDF de la primera pasada guardado en uploads/document_first_pass.pdf');
            resolve();
          });
        } else if (cont === 2) {
          // En la segunda pasada, guardamos el PDF final
          filePath = path.join(uploadDir, 'document.pdf');
          //console.log('Guardando PDF final en:', filePath);
  
          fs.writeFile(filePath, result, (err) => {
            if (err) {
              console.error('Error guardando el archivo final:', err);
              return reject(err);
            }
  
            //console.log('PDF final guardado en uploads/document.pdf');
            // Enviamos el resultado para que pueda ser enviado en la respuesta
            resolve(result);
          });
        }
      });
  
      pdfDoc.on('error', (err) => {
        console.error('Error generando el PDF:', err);
        reject(err);
      });
  
      // Iniciamos la generación del PDF
      pdfDoc.end();
    });
  }

  
// Función para construir el documento
async function buildDocument(htmlContents) {
    //console.log('Construyendo el documento...');
    
    // Función para aplicar estilos
    function applyStyles(contentArray) {
      return contentArray.flat().map((contentItem) => {
        if (contentItem.style) {
          contentItem.style.forEach((style) => {
            const styleDefinition = styles[style];
            if (styleDefinition && 'margin' in styleDefinition) {
              contentItem.margin = styleDefinition.margin;
            }
          });
        }
        return contentItem;
      });
    }
  
    // Paso 1: Convertir el contenido HTML a formato pdfMake
    const pdfContent = htmlContents.map((html) =>
      convertHtmlToPdfmake(html.content, {
        defaultStyles: {
          p: { margin: [0, 0, 0, 10] },
          ol: { margin: [0, 0, 0, 10] },
          ul: { margin: [0, 0, 0, 10] },
          li: { margin: [0, 0, 0, 10] },
        },
      })
    );
  
    const pdfContentNota = htmlContents.map((html) => convertHtmlToPdfmake(html.referencia));
    let notasLimpias = cleanArray(pdfContentNota);
    //console.log('Notas limpias:', JSON.stringify(notasLimpias, null, 2));
  
    const styles = {
      header: { fontSize: 18, bold: true },
      body: { fontSize: 12 },
      'ql-align-right': { alignment: 'right' },
      'ql-align-center': { alignment: 'center' },
      'ql-align-justify': { alignment: 'justify' },
      'ql-indent-1': { margin: [30, 0, 0, 10] },
      'ql-indent-2': { margin: [60, 0, 0, 10] },
      'ql-indent-3': { margin: [90, 0, 0, 10] },
      'ql-indent-4': { margin: [120, 0, 0, 10] },
      superscript: { fontSize: 8, super: true },
    };
  
    // Aplicar estilos al contenido
    let modifiedPdfContent = applyStyles(pdfContent);
    //console.log('Contenido PDF modificado:', JSON.stringify(modifiedPdfContent, null, 2));
  
    // Primera pasada: generar el PDF para obtener el número de páginas
    //console.log('Iniciando primera pasada del PDF...');
    await generatePDF(
      {
        content: modifiedPdfContent,
        styles: styles,
        pageMargins: [40, 120, 40, 100],
      },
      1
    );
  
    // Procesar las notas con las posiciones obtenidas
    //console.log('Procesando notas después de la primera pasada...');
    const mergedArray = processContentNotas(modifiedPdfContent, notasLimpias);
  
    // **Regenerar el contenido antes de la segunda pasada**
    //console.log('Regenerando el contenido para la segunda pasada...');
    const pdfContentSecondPass = htmlContents.map((html) =>
      convertHtmlToPdfmake(html.content, {
        defaultStyles: {
          p: { margin: [0, 0, 0, 10] },
          ol: { margin: [0, 0, 0, 10] },
          ul: { margin: [0, 0, 0, 10] },
          li: { margin: [0, 0, 0, 10] },
        },
      })
    );
  
    modifiedPdfContent = applyStyles(pdfContentSecondPass);
    //console.log('Contenido PDF modificado para la segunda pasada:', JSON.stringify(modifiedPdfContent, null, 2));
  
    // Segunda pasada: construir el documento final
    //console.log('Iniciando segunda pasada del PDF...');
    const docDefinition = {
      content: modifiedPdfContent,
      styles: styles,
      pageMargins: [40, 120, 40, 100],
      footer: function (currentPage, pageCount) {
        //console.log(`Generando pie de página para la página ${currentPage}...`);
        return buildStructure(removeNullOrUndefined(mergedArray), currentPage);
      },
    };
  
    //console.log('Definición del documento completada.');
    return docDefinition;
  }
  
  

  async function buildCompleteList(nodes) {
    const completeList = [];
  
    const traverseTree = (nodes) => {
      nodes.forEach((node) => {
        if (!completeList.includes(node)) { // Evitar duplicaciones
          completeList.push(node); // Agrega el nodo a la lista
          if (node.children && node.children.length > 0) {
            traverseTree(node.children); // Recorre recursivamente los hijos
          }
        } else {
          console.warn("Nodo duplicado omitido:", node); // Avisar sobre posibles duplicaciones
        }
      });
    };
  
    traverseTree(nodes); // Inicia el recorrido
  
    return completeList; // Devuelve la lista completa con todos los nodos
  }

  function preprocessContent(htmlContents){
    return htmlContents.map((html) => {
      html.content = replaceSupTags(html.content, html.referencia);
      return html;
    });
  }

  function replaceSupTags(html, referencia) {
    if (typeof html !== 'string') {
      // Maneja el caso donde html no es una cadena
      console.warn('El valor de html no es una cadena:', html);
      return '';
    }
    return html.replace(/<sup>(.*?)<\/sup>/g, `<sup style="font-size: 8px; vertical-align: super;" class="superscript">$1</sup>`);
  }


  async function findNodeById(rootNodes, targetId) {
    for (const node of rootNodes) {
      if (node.id === targetId) {
        return node; // Nodo encontrado
      }
      if (node.children && node.children.length > 0) {
        const found = await findNodeById(node.children, targetId); // Llamada recursiva
        if (found) return found;
      }
    }
    return null; // Nodo no encontrado
  }
 

  async function searchNode(idPadre,idHijo) {
    try {
      const idToSearch = new mongoose.Types.ObjectId(idPadre);
      const rootNodes = await ArticuloNode.find({ _id:idToSearch }); 
      const foundNode = await findNodeById(rootNodes, idHijo); 
      if (foundNode) {
        console.log('Nodo encontrado:', foundNode);
        return foundNode;
      } else {
        console.log('Nodo no encontrado');
        return [];
      }
    } catch (error) {
      console.error('Error buscando el nodo:', error);
    }
  }

  async function searchNodeAll() {
    try {
      const rootNodes = await ArticuloNode.find({}); 
      if (rootNodes) {
        console.log('rootNodes:', rootNodes);
        return rootNodes;
      } else {
        console.log('Nodo no encontrado');
        return [];
      }
    } catch (error) {
      console.error('Error buscando el nodo:', error);
    }
  }

// Endpoint para generar el PDF
app.post('/generate-pdf', async (req, res) => {
    try {
        /* const datos = await searchNode('66c765cfce42406a9d40d87b', '66c765cfce42406a9d40d87b');
        const { htmlContents } = {
          "htmlContents": [datos]
        }; */

        const datos = await searchNodeAll();
        const { htmlContents } = {
          "htmlContents": datos
        };
        const aplanar = await buildCompleteList(htmlContents);
        //console.log('Es array:', Array.isArray(aplanar));
        const aplanadaNotas = preprocessContent(aplanar);
        const docDefinition = await buildDocument(aplanadaNotas);
        //console.log(docDefinition);
    // Generar el PDF final
    //console.log('Generando PDF final...');
    const result = await generatePDF(docDefinition, 2);

    // Guardar el PDF en el directorio 'uploads'
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
      //console.log('Directorio "uploads" creado.');
    }

    const filePath = path.join(uploadDir, 'document.pdf');
    //console.log('Guardando PDF en:', filePath);

    fs.writeFile(filePath, result, (err) => {
      if (err) {
        console.error('Error guardando el archivo:', err);
        return res.status(500).send('Error guardando el archivo');
      }

      //console.log('PDF guardado en uploads/document.pdf');

      // Enviar el PDF como respuesta
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=document.pdf');
      res.send(result);
    });
  } catch (error) {
    console.error('Error generando el PDF:', error);
    res.status(500).send('Error generando el PDF');
  }
});

// Iniciar el servidor
app.listen(3002, () => {
  //console.log('Servidor de PDFs ejecutándose en http://localhost:3002');
});