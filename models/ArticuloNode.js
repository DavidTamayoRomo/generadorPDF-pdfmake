const mongoose = require('mongoose');

// Definir el esquema principal
const ArticuloNodeSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Nombre del nodo
  content: { type: String, required: true }, // Contenido HTML
  state: { type: String, default: 'activo' }, // Estado del nodo
  referencia: { type: String, default: '' }, // Campo opcional para referencia
  isVisible: { type: Boolean, default: true }, // Visibilidad del nodo
  isExpanded: { type: Boolean, default: false }, // Expandido en interfaz
  id_padre: { type: String, default: null }, // ID del nodo padre
  content_transform: { type: String, default: '' }, // Transformación del contenido
  usuario_creacion: { type: String, required: true }, // Usuario creador
  usuario_modificacion: { type: String, default: null }, // Usuario que modificó
  fecha_creacion: { type: Date, default: Date.now }, // Fecha de creación
  fecha_modificacion: { type: Date, default: Date.now }, // Fecha de modificación
  isFirstLevel: { type: Boolean, default: false }, // Si es un nodo de primer nivel
  orden: { type: Number, default: 0 }, // Orden dentro del nivel
  anexo: { type: Array, default: [] }, // Anexos adicionales
  generacion: { type: String, default: '' }, // Generación o información adicional
});

ArticuloNodeSchema.add({
  children: [ArticuloNodeSchema],
});

// Crear el modelo
const ArticuloNode = mongoose.model('ArticuloNode', ArticuloNodeSchema, 'CONTENIDO');

module.exports = ArticuloNode;
