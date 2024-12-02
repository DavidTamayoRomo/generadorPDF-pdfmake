const express = require('express');
const pdfMakePrinter = require('pdfmake/src/printer');
const htmlToPdfmake = require('html-to-pdfmake');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');

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

const printer = new pdfMakePrinter(fonts);

// Variable para guardar el docDefinition de la primera pasada
let docDefinitionFirstPass;

// Función para simular el entorno DOM
function convertHtmlToPdfmake(html, options) {
  console.log('Convirtiendo HTML a pdfMake...');
  const dom = new JSDOM(html);
  global.window = dom.window;
  global.document = dom.window.document;
  const result = htmlToPdfmake(html, options);
  console.log('Resultado de la conversión:', JSON.stringify(result, null, 2));
  return result;
}

// Función para limpiar notas
function cleanArray(arr) {
  console.log('Limpiando array de notas...');
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
  console.log('Resultado del array limpio:', JSON.stringify(result, null, 2));
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
  console.log('Buscando elementos con nodeName:', value);
  let result = [];

  function search(obj, value, parent = null, grandparent = null) {
    if (typeof obj === 'object' && obj !== null) {
      if (obj.nodeName === value) {
        if (!result.includes(grandparent)) {
          result.push(grandparent);
        }
      }
      for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
          search(obj[key], value, obj, parent);
        }
      }
    }
  }

  search(obj, value);
  console.log('Elementos encontrados:', JSON.stringify(result, null, 2));
  return result;
}

// Función para verificar arrays
function verificadorDeArray(array1, array2) {
  console.log('Verificando arrays...');
  const resultado = [];
  let indexArray1 = 0;
  let congelarIteraciones = 0;

  array2.forEach((subArray) => {
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

  console.log('Resultado de verificación de arrays:', JSON.stringify(resultado, null, 2));
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
  console.log(`Construyendo estructura del pie de página para la página ${pageNumber}...`);
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
  console.log('Estructura del pie de página:', JSON.stringify(result, null, 2));
  return result;
}

// Función para procesar las notas de contenido
function processContentNotas(modifiedPdfContent, notasLimpias) {
  console.log('Procesando contenido de notas...');
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
      const pageNumber = item.itemFromArray1.pageNumber || 1;

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
  console.log('Notas procesadas:', JSON.stringify(result, null, 2));
  return result;
}

// Función para generar el PDF
async function generatePDF(docDefinition, cont) {
    console.log(`Generando PDF (pasada ${cont})...`);
    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
  
      // Suscribirse al evento 'data' para leer los datos del PDF
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
  
      // Suscribirse al evento 'end' para saber cuándo ha terminado la generación
      pdfDoc.on('end', () => {
        console.log(`Pasada ${cont} del PDF completada.`);
        const result = Buffer.concat(chunks);
  
        // Guardar el PDF generado
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir);
          console.log('Directorio "uploads" creado.');
        }
  
        let filePath;
        if (cont === 1) {
          // En la primera pasada, guardamos el PDF como 'document_first_pass.pdf'
          filePath = path.join(uploadDir, 'document_first_pass.pdf');
          console.log('Guardando PDF de la primera pasada en:', filePath);
  
          fs.writeFile(filePath, result, (err) => {
            if (err) {
              console.error('Error guardando el archivo de la primera pasada:', err);
              return reject(err);
            }
  
            console.log('PDF de la primera pasada guardado en uploads/document_first_pass.pdf');
            resolve();
          });
        } else if (cont === 2) {
          // En la segunda pasada, guardamos el PDF final
          filePath = path.join(uploadDir, 'document.pdf');
          console.log('Guardando PDF final en:', filePath);
  
          fs.writeFile(filePath, result, (err) => {
            if (err) {
              console.error('Error guardando el archivo final:', err);
              return reject(err);
            }
  
            console.log('PDF final guardado en uploads/document.pdf');
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
  console.log('Construyendo el documento...');
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
  /* console.log('Contenido PDF:', JSON.stringify(pdfContent, null, 2)); */

  const pdfContentNota = htmlContents.map((html) => convertHtmlToPdfmake(html.referencia));
  let notasLimpias = cleanArray(pdfContentNota);
  console.log('Notas limpias:', JSON.stringify(notasLimpias, null, 2));

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
  /* console.log('Estilos definidos:', JSON.stringify(styles, null, 2)); */

  const modifiedPdfContent = pdfContent.flat().map((content) => {
    if (content.style) {
      content.style.forEach((style) => {
        const styleDefinition = styles[style];
        if (styleDefinition && 'margin' in styleDefinition) {
          content.margin = styleDefinition.margin;
        }
      });
    }
    return content;
  });
  console.log('Contenido PDF modificado:', JSON.stringify(modifiedPdfContent, null, 2));

  // Primera pasada: generar el PDF para obtener el número de páginas
  console.log('Iniciando primera pasada del PDF...');
  await generatePDF(
    {
      content: modifiedPdfContent,
      styles: styles,
      pageMargins: [40, 120, 40, 100],
    },
    1
  );

  // Procesar las notas con las posiciones obtenidas
  console.log('Procesando notas después de la primera pasada...');
  const mergedArray = processContentNotas(modifiedPdfContent, notasLimpias);

  // Segunda pasada: construir el documento final
  console.log('Iniciando segunda pasada del PDF...');
  const docDefinition = {
    content: modifiedPdfContent,
    styles: styles,
    pageMargins: [40, 120, 40, 100],
    footer: function (currentPage, pageCount) {
      console.log(`Generando pie de página para la página ${currentPage}...`);
      return buildStructure(removeNullOrUndefined(mergedArray), currentPage);
    },
  };

  console.log('Definición del documento completada.');
  console.log(docDefinition.content[0].positions);
  return docDefinition;
}



// Endpoint para generar el PDF
app.post('/generate-pdf', async (req, res) => {
    try {
        const { htmlContents } = {
            "htmlContents": [
                {
                    "id": "66c765f0ce42406a9d40e914",
                    "name": "DISPOSICIONES GENERALES, TRANSITORIA Y FINAL DISPOSICIONES GENERALES",
                    "content": "<p class=\"ql-align-center\"><strong>DISPOSICIONES GENERALES, TRANSITORIA Y FINAL DISPOSICIONES GENERALES</strong><sup style=\"font-size: 8px; vertical-align: super;\" class=\"superscript\">1</sup></p>",
                    "state": "activo",
                    "referencia": "<p><sup>1</sup>Nota de prueba</p>",
                    "children": [
                        {
                            "id": "66c765f0ce42406a9d40e915",
                            "name": "DISPOSICIONES GENERALES,",
                            "content": "<p class=\"ql-align-center\"><strong>DISPOSICIONES GENERALES,</strong></p>",
                            "state": "activo",
                            "referencia": null,
                            "children": [
                                {
                                    "id": "66c765f0ce42406a9d40e916",
                                    "name": "Primera.- ",
                                    "content": "<p class=\"ql-align-justify\"><strong>Primera.- </strong>Las Ordenanzas Metropolitanas sancionadas con posterioridad a la expedición de la presente Ordenanza, que rijan aspectos de carácter general, deberán incluir dentro de sus disposiciones la obligación de incorporar las normas al Código Municipal, para tal efecto deberán señalar el Libro, Título, Sección, Capítulo y Parágrafo según corresponda, para su inclusión, sustitución, reforma o eliminación.</p>",
                                    "state": "activo",
                                    "referencia": null,
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": "",
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "ftamayor",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": "2024-12-02T16:37:45.828+00:00",
                                    "isFirstLevel": null,
                                    "orden": 1,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e917",
                                    "name": "Segunda.-",
                                    "content": "<p class='ql-align-justify'><strong>Segunda.-</strong> La Secretaría General del Concejo Metropolitano incorporará las modificaciones que hubiere aprobado el Concejo Metropolitano y las pondrá a disposición de la ciudadanía de manera inmediata en la plataforma digital que contenga el Código Municipal. Adicionalmente, en los portales web de la Municipalidad, se crearán enlaces que contengan los archivos editables de texto con las páginas del Código Municipal que han sido modificadas en base a la normativa legal expedida, para la actualización de los formatos impresos del Código. </p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 2,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e918",
                                    "name": "Tercera.- ",
                                    "content": "<p class='ql-align-justify'><strong>Tercera.- </strong>La Secretaría General del Concejo Metropolitano, a partir de la sanción de la presente Ordenanza Metropolitana, asignará de manera secuencial la numeración respectiva para las Ordenanzas posteriores a la expedición del Código Municipal, evitando la duplicidad de numeración de los proyectos normativos.<br><br>Para el efecto, conforme el presente Código, se contará con una numeración secuencial e independiente para los siguientes actos normativos: 1) Ordenanzas reformatorias del Código Municipal; 2) Ordenanzas que contengan Planes Metropolitanos de Desarrollo y Ordenamiento Territorial, de Uso y Gestión del Suelo, Planes Especiales, Planes Parciales, y sus respectivas reformas; 3) Ordenanzas presupuestarias; 4) Ordenanzas de designación de espacios públicos; 5) Ordenanzas sobre declaratorias de áreas de protección ambiental; 6) Ordenanzas de regularización de urbanizaciones sujetas a reglamentación general y de interés social; y, 7) Ordenanzas de asentamientos humanos de hecho y consolidados.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 3,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e919",
                                    "name": "Cuarta.- ",
                                    "content": "<p class=\"ql-align-justify\"><strong>Cuarta.- </strong>Las disposiciones transitorias contenidas en las ordenanzas que forman parte de la presente codificación o de las que con posterioridad se sancionen, serán incluidas en una matriz a cargo de la Secretaría General del Concejo, la cual será expuesta en el portal institucional de gobierno abierto, para su cumplimiento obligatorio por parte de las dependencias municipales correspondientes, dentro del periodo de tiempo dispuesto por el Cuerpo Edilicio.</p>",
                                    "state": "activo",
                                    "referencia": null,
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": "",
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "ftamayor",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": "2024-12-02T16:38:06.875+00:00",
                                    "isFirstLevel": null,
                                    "orden": 4,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e91a",
                                    "name": "Quinta.-",
                                    "content": "<p class='ql-align-justify'><strong>Quinta.-</strong> La Secretaría General del Concejo Metropolitano deberá crear, en el portal institucional de gobierno abierto de la Municipalidad, los enlaces correspondientes a aquella normativa municipal que no ha sido incluida en el presente Código Municipal, tales como Ordenanzas de carácter particular o temporal, Resoluciones del Concejo Metropolitano o de la Administración Municipal, y Reglamentos o Anexos de la normativa municipal.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 5,
                                    "anexo": null,
                                    "generacion": null
                                }
                            ],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": "",
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "ftamayor",
                            "fecha_creacion": null,
                            "fecha_modificacion": "2024-10-18T19:58:31.958+00:00",
                            "isFirstLevel": null,
                            "orden": 1,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e91b",
                            "name": "DISPOSICIONES TRANSITORIAS",
                            "content": "<p class=\"ql-align-center\"><strong>DISPOSICIONES TRANSITORIAS</strong></p>",
                            "state": "activo",
                            "referencia": null,
                            "children": [
                                {
                                    "id": "66c765f0ce42406a9d40e91c",
                                    "name": "Primera.-",
                                    "content": "<p class='ql-align-justify'><strong>Primera.-</strong> La Secretaría de Comunicación socializará el Código Municipal a partir de su sanción. Para el efecto, la herramienta desarrollada deberá incluirse en las páginas web y plataformas digitales de  las instituciones municipales.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 1,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e91d",
                                    "name": "Segunda - ",
                                    "content": "<p class='ql-align-justify'><strong>Segunda - </strong>Se dispone que la Secretaría General del Concejo Metropolitano compile los anexos vigentes a los que hace referencia el Código Municipal para el Distrito Metropolitano y los publique en la sede electrónica del Municipio.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 2,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e91e",
                                    "name": "Tercera. ",
                                    "content": "<p class='ql-align-justify'><strong>Tercera. </strong>- La Secretaría General del Concejo Metropolitano remitirá al Registro Oficial la Codificación del Código Municipal para el Distrito Metropolitano de Quito.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 3,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e91f",
                                    "name": "Cuarta.-",
                                    "content": "<p class='ql-align-justify'><strong>Cuarta.-</strong> Las Disposiciones transitorias novena, décima, décima primera, décima segunda, décima tercera de la Codificación del Código Municipal, publicada en el Registro Oficial Edición Especial No. 860 del 8 de mayo 2023, se incorporarán en la matriz de seguimiento de las disposiciones transitorias que realiza la Secretaría General de conformidad con la disposición general cuarta.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 4,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e920",
                                    "name": "Quinta.- ",
                                    "content": "<p class='ql-align-justify'><strong>Quinta.- </strong>La Secretaría de Gobierno Digital y Tecnologías de la Información y Comunicaciones en el plazo de noventa (90) días, contado a partir de la sanción de la presente Ordenanza, desarrollará un aplicativo informático de libre acceso, que permita consultar su contenido y las reformas que se realicen al mismo.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 5,
                                    "anexo": null,
                                    "generacion": null
                                }
                            ],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": "",
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "ftamayor",
                            "fecha_creacion": null,
                            "fecha_modificacion": "2024-10-18T19:58:39.520+00:00",
                            "isFirstLevel": null,
                            "orden": 2,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e921",
                            "name": "DISPOSICIÓN DEROGATORIA.- ",
                            "content": "<p class='ql-align-justify'><strong>DISPOSICIÓN DEROGATORIA.- </strong>Se deroga la Codificación del Código Municipal publicada en el Registro Oficial  Edición Especial No. 860 del 8 de mayo de 2023</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 3,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e922",
                            "name": "DISPOSICIONES FINALES.-",
                            "content": "<p class=\"ql-align-justify\"><strong>DISPOSICIONES FINALES.-</strong></p>",
                            "state": "activo",
                            "referencia": null,
                            "children": [
                                {
                                    "id": "66c765f0ce42406a9d40e923",
                                    "name": "Primera.",
                                    "content": "<p class='ql-align-justify'><strong>Primera.</strong> Forman parte de la presente Codificación, los anexos que se adjuntan a la misma.</p>",
                                    "state": "activo",
                                    "referencia": "",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": null,
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "sistema",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": null,
                                    "isFirstLevel": null,
                                    "orden": 1,
                                    "anexo": null,
                                    "generacion": null
                                },
                                {
                                    "id": "66c765f0ce42406a9d40e924",
                                    "name": "Segunda.",
                                    "content": "<p class=\"ql-align-justify\"><strong>Segunda.</strong>- La presente Ordenanza de Codificación del Código Municipal para el Distrito Metropolitano de Quito entrará en vigencia a partir de su sanción.<sup style=\"font-size: 8px; vertical-align: super;\" class=\"superscript\">2</sup></p>",
                                    "state": "activo",
                                    "referencia": "<p><sup>2</sup>Ultima nota</p>",
                                    "children": [],
                                    "isVisible": null,
                                    "isExpanded": null,
                                    "id_padre": "66c765f0ce42406a9d40e914",
                                    "content_transform": "",
                                    "usuario_creacion": "sistema",
                                    "usuario_modificacion": "ftamayor",
                                    "fecha_creacion": null,
                                    "fecha_modificacion": "2024-12-02T14:41:33.710+00:00",
                                    "isFirstLevel": null,
                                    "orden": 2,
                                    "anexo": null,
                                    "generacion": null
                                }
                            ],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": "",
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "ftamayor",
                            "fecha_creacion": null,
                            "fecha_modificacion": "2024-10-18T19:58:49.150+00:00",
                            "isFirstLevel": null,
                            "orden": 4,
                            "anexo": null,
                            "generacion": null
                        }
                    ],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": null,
                    "content_transform": "",
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "ftamayor",
                    "fecha_creacion": null,
                    "fecha_modificacion": "2024-12-02T14:41:04.669+00:00",
                    "isFirstLevel": true,
                    "orden": 9,
                    "anexo": null,
                    "generacion": "PENDIENTE"
                },
                {
                    "id": "66c765f0ce42406a9d40e915",
                    "name": "DISPOSICIONES GENERALES,",
                    "content": "<p class=\"ql-align-center\"><strong>DISPOSICIONES GENERALES,</strong></p>",
                    "state": "activo",
                    "referencia": null,
                    "children": [
                        {
                            "id": "66c765f0ce42406a9d40e916",
                            "name": "Primera.- ",
                            "content": "<p class=\"ql-align-justify\"><strong>Primera.- </strong>Las Ordenanzas Metropolitanas sancionadas con posterioridad a la expedición de la presente Ordenanza, que rijan aspectos de carácter general, deberán incluir dentro de sus disposiciones la obligación de incorporar las normas al Código Municipal, para tal efecto deberán señalar el Libro, Título, Sección, Capítulo y Parágrafo según corresponda, para su inclusión, sustitución, reforma o eliminación.</p>",
                            "state": "activo",
                            "referencia": null,
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": "",
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "ftamayor",
                            "fecha_creacion": null,
                            "fecha_modificacion": "2024-12-02T16:37:45.828+00:00",
                            "isFirstLevel": null,
                            "orden": 1,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e917",
                            "name": "Segunda.-",
                            "content": "<p class='ql-align-justify'><strong>Segunda.-</strong> La Secretaría General del Concejo Metropolitano incorporará las modificaciones que hubiere aprobado el Concejo Metropolitano y las pondrá a disposición de la ciudadanía de manera inmediata en la plataforma digital que contenga el Código Municipal. Adicionalmente, en los portales web de la Municipalidad, se crearán enlaces que contengan los archivos editables de texto con las páginas del Código Municipal que han sido modificadas en base a la normativa legal expedida, para la actualización de los formatos impresos del Código. </p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 2,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e918",
                            "name": "Tercera.- ",
                            "content": "<p class='ql-align-justify'><strong>Tercera.- </strong>La Secretaría General del Concejo Metropolitano, a partir de la sanción de la presente Ordenanza Metropolitana, asignará de manera secuencial la numeración respectiva para las Ordenanzas posteriores a la expedición del Código Municipal, evitando la duplicidad de numeración de los proyectos normativos.<br><br>Para el efecto, conforme el presente Código, se contará con una numeración secuencial e independiente para los siguientes actos normativos: 1) Ordenanzas reformatorias del Código Municipal; 2) Ordenanzas que contengan Planes Metropolitanos de Desarrollo y Ordenamiento Territorial, de Uso y Gestión del Suelo, Planes Especiales, Planes Parciales, y sus respectivas reformas; 3) Ordenanzas presupuestarias; 4) Ordenanzas de designación de espacios públicos; 5) Ordenanzas sobre declaratorias de áreas de protección ambiental; 6) Ordenanzas de regularización de urbanizaciones sujetas a reglamentación general y de interés social; y, 7) Ordenanzas de asentamientos humanos de hecho y consolidados.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 3,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e919",
                            "name": "Cuarta.- ",
                            "content": "<p class=\"ql-align-justify\"><strong>Cuarta.- </strong>Las disposiciones transitorias contenidas en las ordenanzas que forman parte de la presente codificación o de las que con posterioridad se sancionen, serán incluidas en una matriz a cargo de la Secretaría General del Concejo, la cual será expuesta en el portal institucional de gobierno abierto, para su cumplimiento obligatorio por parte de las dependencias municipales correspondientes, dentro del periodo de tiempo dispuesto por el Cuerpo Edilicio.</p>",
                            "state": "activo",
                            "referencia": null,
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": "",
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "ftamayor",
                            "fecha_creacion": null,
                            "fecha_modificacion": "2024-12-02T16:38:06.875+00:00",
                            "isFirstLevel": null,
                            "orden": 4,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e91a",
                            "name": "Quinta.-",
                            "content": "<p class='ql-align-justify'><strong>Quinta.-</strong> La Secretaría General del Concejo Metropolitano deberá crear, en el portal institucional de gobierno abierto de la Municipalidad, los enlaces correspondientes a aquella normativa municipal que no ha sido incluida en el presente Código Municipal, tales como Ordenanzas de carácter particular o temporal, Resoluciones del Concejo Metropolitano o de la Administración Municipal, y Reglamentos o Anexos de la normativa municipal.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 5,
                            "anexo": null,
                            "generacion": null
                        }
                    ],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": "",
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "ftamayor",
                    "fecha_creacion": null,
                    "fecha_modificacion": "2024-10-18T19:58:31.958+00:00",
                    "isFirstLevel": null,
                    "orden": 1,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e916",
                    "name": "Primera.- ",
                    "content": "<p class=\"ql-align-justify\"><strong>Primera.- </strong>Las Ordenanzas Metropolitanas sancionadas con posterioridad a la expedición de la presente Ordenanza, que rijan aspectos de carácter general, deberán incluir dentro de sus disposiciones la obligación de incorporar las normas al Código Municipal, para tal efecto deberán señalar el Libro, Título, Sección, Capítulo y Parágrafo según corresponda, para su inclusión, sustitución, reforma o eliminación.</p>",
                    "state": "activo",
                    "referencia": null,
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": "",
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "ftamayor",
                    "fecha_creacion": null,
                    "fecha_modificacion": "2024-12-02T16:37:45.828+00:00",
                    "isFirstLevel": null,
                    "orden": 1,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e917",
                    "name": "Segunda.-",
                    "content": "<p class='ql-align-justify'><strong>Segunda.-</strong> La Secretaría General del Concejo Metropolitano incorporará las modificaciones que hubiere aprobado el Concejo Metropolitano y las pondrá a disposición de la ciudadanía de manera inmediata en la plataforma digital que contenga el Código Municipal. Adicionalmente, en los portales web de la Municipalidad, se crearán enlaces que contengan los archivos editables de texto con las páginas del Código Municipal que han sido modificadas en base a la normativa legal expedida, para la actualización de los formatos impresos del Código. </p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 2,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e918",
                    "name": "Tercera.- ",
                    "content": "<p class='ql-align-justify'><strong>Tercera.- </strong>La Secretaría General del Concejo Metropolitano, a partir de la sanción de la presente Ordenanza Metropolitana, asignará de manera secuencial la numeración respectiva para las Ordenanzas posteriores a la expedición del Código Municipal, evitando la duplicidad de numeración de los proyectos normativos.<br><br>Para el efecto, conforme el presente Código, se contará con una numeración secuencial e independiente para los siguientes actos normativos: 1) Ordenanzas reformatorias del Código Municipal; 2) Ordenanzas que contengan Planes Metropolitanos de Desarrollo y Ordenamiento Territorial, de Uso y Gestión del Suelo, Planes Especiales, Planes Parciales, y sus respectivas reformas; 3) Ordenanzas presupuestarias; 4) Ordenanzas de designación de espacios públicos; 5) Ordenanzas sobre declaratorias de áreas de protección ambiental; 6) Ordenanzas de regularización de urbanizaciones sujetas a reglamentación general y de interés social; y, 7) Ordenanzas de asentamientos humanos de hecho y consolidados.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 3,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e919",
                    "name": "Cuarta.- ",
                    "content": "<p class=\"ql-align-justify\"><strong>Cuarta.- </strong>Las disposiciones transitorias contenidas en las ordenanzas que forman parte de la presente codificación o de las que con posterioridad se sancionen, serán incluidas en una matriz a cargo de la Secretaría General del Concejo, la cual será expuesta en el portal institucional de gobierno abierto, para su cumplimiento obligatorio por parte de las dependencias municipales correspondientes, dentro del periodo de tiempo dispuesto por el Cuerpo Edilicio.</p>",
                    "state": "activo",
                    "referencia": null,
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": "",
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "ftamayor",
                    "fecha_creacion": null,
                    "fecha_modificacion": "2024-12-02T16:38:06.875+00:00",
                    "isFirstLevel": null,
                    "orden": 4,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e91a",
                    "name": "Quinta.-",
                    "content": "<p class='ql-align-justify'><strong>Quinta.-</strong> La Secretaría General del Concejo Metropolitano deberá crear, en el portal institucional de gobierno abierto de la Municipalidad, los enlaces correspondientes a aquella normativa municipal que no ha sido incluida en el presente Código Municipal, tales como Ordenanzas de carácter particular o temporal, Resoluciones del Concejo Metropolitano o de la Administración Municipal, y Reglamentos o Anexos de la normativa municipal.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 5,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e91b",
                    "name": "DISPOSICIONES TRANSITORIAS",
                    "content": "<p class=\"ql-align-center\"><strong>DISPOSICIONES TRANSITORIAS</strong></p>",
                    "state": "activo",
                    "referencia": null,
                    "children": [
                        {
                            "id": "66c765f0ce42406a9d40e91c",
                            "name": "Primera.-",
                            "content": "<p class='ql-align-justify'><strong>Primera.-</strong> La Secretaría de Comunicación socializará el Código Municipal a partir de su sanción. Para el efecto, la herramienta desarrollada deberá incluirse en las páginas web y plataformas digitales de  las instituciones municipales.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 1,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e91d",
                            "name": "Segunda - ",
                            "content": "<p class='ql-align-justify'><strong>Segunda - </strong>Se dispone que la Secretaría General del Concejo Metropolitano compile los anexos vigentes a los que hace referencia el Código Municipal para el Distrito Metropolitano y los publique en la sede electrónica del Municipio.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 2,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e91e",
                            "name": "Tercera. ",
                            "content": "<p class='ql-align-justify'><strong>Tercera. </strong>- La Secretaría General del Concejo Metropolitano remitirá al Registro Oficial la Codificación del Código Municipal para el Distrito Metropolitano de Quito.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 3,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e91f",
                            "name": "Cuarta.-",
                            "content": "<p class='ql-align-justify'><strong>Cuarta.-</strong> Las Disposiciones transitorias novena, décima, décima primera, décima segunda, décima tercera de la Codificación del Código Municipal, publicada en el Registro Oficial Edición Especial No. 860 del 8 de mayo 2023, se incorporarán en la matriz de seguimiento de las disposiciones transitorias que realiza la Secretaría General de conformidad con la disposición general cuarta.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 4,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e920",
                            "name": "Quinta.- ",
                            "content": "<p class='ql-align-justify'><strong>Quinta.- </strong>La Secretaría de Gobierno Digital y Tecnologías de la Información y Comunicaciones en el plazo de noventa (90) días, contado a partir de la sanción de la presente Ordenanza, desarrollará un aplicativo informático de libre acceso, que permita consultar su contenido y las reformas que se realicen al mismo.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 5,
                            "anexo": null,
                            "generacion": null
                        }
                    ],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": "",
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "ftamayor",
                    "fecha_creacion": null,
                    "fecha_modificacion": "2024-10-18T19:58:39.520+00:00",
                    "isFirstLevel": null,
                    "orden": 2,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e91c",
                    "name": "Primera.-",
                    "content": "<p class='ql-align-justify'><strong>Primera.-</strong> La Secretaría de Comunicación socializará el Código Municipal a partir de su sanción. Para el efecto, la herramienta desarrollada deberá incluirse en las páginas web y plataformas digitales de  las instituciones municipales.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 1,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e91d",
                    "name": "Segunda - ",
                    "content": "<p class='ql-align-justify'><strong>Segunda - </strong>Se dispone que la Secretaría General del Concejo Metropolitano compile los anexos vigentes a los que hace referencia el Código Municipal para el Distrito Metropolitano y los publique en la sede electrónica del Municipio.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 2,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e91e",
                    "name": "Tercera. ",
                    "content": "<p class='ql-align-justify'><strong>Tercera. </strong>- La Secretaría General del Concejo Metropolitano remitirá al Registro Oficial la Codificación del Código Municipal para el Distrito Metropolitano de Quito.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 3,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e91f",
                    "name": "Cuarta.-",
                    "content": "<p class='ql-align-justify'><strong>Cuarta.-</strong> Las Disposiciones transitorias novena, décima, décima primera, décima segunda, décima tercera de la Codificación del Código Municipal, publicada en el Registro Oficial Edición Especial No. 860 del 8 de mayo 2023, se incorporarán en la matriz de seguimiento de las disposiciones transitorias que realiza la Secretaría General de conformidad con la disposición general cuarta.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 4,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e920",
                    "name": "Quinta.- ",
                    "content": "<p class='ql-align-justify'><strong>Quinta.- </strong>La Secretaría de Gobierno Digital y Tecnologías de la Información y Comunicaciones en el plazo de noventa (90) días, contado a partir de la sanción de la presente Ordenanza, desarrollará un aplicativo informático de libre acceso, que permita consultar su contenido y las reformas que se realicen al mismo.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 5,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e921",
                    "name": "DISPOSICIÓN DEROGATORIA.- ",
                    "content": "<p class='ql-align-justify'><strong>DISPOSICIÓN DEROGATORIA.- </strong>Se deroga la Codificación del Código Municipal publicada en el Registro Oficial  Edición Especial No. 860 del 8 de mayo de 2023</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 3,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e922",
                    "name": "DISPOSICIONES FINALES.-",
                    "content": "<p class=\"ql-align-justify\"><strong>DISPOSICIONES FINALES.-</strong></p>",
                    "state": "activo",
                    "referencia": null,
                    "children": [
                        {
                            "id": "66c765f0ce42406a9d40e923",
                            "name": "Primera.",
                            "content": "<p class='ql-align-justify'><strong>Primera.</strong> Forman parte de la presente Codificación, los anexos que se adjuntan a la misma.</p>",
                            "state": "activo",
                            "referencia": "",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": null,
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "sistema",
                            "fecha_creacion": null,
                            "fecha_modificacion": null,
                            "isFirstLevel": null,
                            "orden": 1,
                            "anexo": null,
                            "generacion": null
                        },
                        {
                            "id": "66c765f0ce42406a9d40e924",
                            "name": "Segunda.",
                            "content": "<p class=\"ql-align-justify\"><strong>Segunda.</strong>- La presente Ordenanza de Codificación del Código Municipal para el Distrito Metropolitano de Quito entrará en vigencia a partir de su sanción.<sup style=\"font-size: 8px; vertical-align: super;\" class=\"superscript\">2</sup></p>",
                            "state": "activo",
                            "referencia": "<p><sup>2</sup>Ultima nota</p>",
                            "children": [],
                            "isVisible": null,
                            "isExpanded": null,
                            "id_padre": "66c765f0ce42406a9d40e914",
                            "content_transform": "",
                            "usuario_creacion": "sistema",
                            "usuario_modificacion": "ftamayor",
                            "fecha_creacion": null,
                            "fecha_modificacion": "2024-12-02T14:41:33.710+00:00",
                            "isFirstLevel": null,
                            "orden": 2,
                            "anexo": null,
                            "generacion": null
                        }
                    ],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": "",
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "ftamayor",
                    "fecha_creacion": null,
                    "fecha_modificacion": "2024-10-18T19:58:49.150+00:00",
                    "isFirstLevel": null,
                    "orden": 4,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e923",
                    "name": "Primera.",
                    "content": "<p class='ql-align-justify'><strong>Primera.</strong> Forman parte de la presente Codificación, los anexos que se adjuntan a la misma.</p>",
                    "state": "activo",
                    "referencia": "",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": null,
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "sistema",
                    "fecha_creacion": null,
                    "fecha_modificacion": null,
                    "isFirstLevel": null,
                    "orden": 1,
                    "anexo": null,
                    "generacion": null
                },
                {
                    "id": "66c765f0ce42406a9d40e924",
                    "name": "Segunda.",
                    "content": "<p class=\"ql-align-justify\"><strong>Segunda.</strong>- La presente Ordenanza de Codificación del Código Municipal para el Distrito Metropolitano de Quito entrará en vigencia a partir de su sanción.<sup style=\"font-size: 8px; vertical-align: super;\" class=\"superscript\">2</sup></p>",
                    "state": "activo",
                    "referencia": "<p><sup>2</sup>Ultima nota</p>",
                    "children": [],
                    "isVisible": null,
                    "isExpanded": null,
                    "id_padre": "66c765f0ce42406a9d40e914",
                    "content_transform": "",
                    "usuario_creacion": "sistema",
                    "usuario_modificacion": "ftamayor",
                    "fecha_creacion": null,
                    "fecha_modificacion": "2024-12-02T14:41:33.710+00:00",
                    "isFirstLevel": null,
                    "orden": 2,
                    "anexo": null,
                    "generacion": null
                }
            ]
        };

        const docDefinition = await buildDocument(htmlContents);
        console.log(docDefinition);
    // Generar el PDF final
    console.log('Generando PDF final...');
    const result = await generatePDF(docDefinition, 2);

    // Guardar el PDF en el directorio 'uploads'
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
      console.log('Directorio "uploads" creado.');
    }

    const filePath = path.join(uploadDir, 'document.pdf');
    console.log('Guardando PDF en:', filePath);

    fs.writeFile(filePath, result, (err) => {
      if (err) {
        console.error('Error guardando el archivo:', err);
        return res.status(500).send('Error guardando el archivo');
      }

      console.log('PDF guardado en uploads/document.pdf');

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
  console.log('Servidor de PDFs ejecutándose en http://localhost:3002');
});