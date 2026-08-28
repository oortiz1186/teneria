import { createReceipt } from "./actions";

export default function ReceiptsPage() {
  return (
    <>
      <div className="header">
        <div>
          <h1 className="title">Recepción de piel</h1>
          <div className="muted">Primera versión: crea recepción, lote y movimiento de almacén en una sola operación.</div>
        </div>
      </div>

      <form action={createReceipt} className="form">
        <div className="field">
          <label>Proveedor</label>
          <input name="supplierName" placeholder="Nombre del proveedor" required />
        </div>

        <div className="field">
          <label>Origen</label>
          <input name="origin" placeholder="Rastro / ciudad / referencia" />
        </div>

        <div className="field">
          <label>Tipo de piel</label>
          <select name="animalType" required>
            <option value="Bovino">Bovino</option>
            <option value="Caprino">Caprino</option>
            <option value="Ovino">Ovino</option>
            <option value="Porcino">Porcino</option>
            <option value="Otro">Otro</option>
          </select>
        </div>

        <div className="field">
          <label>Número de pieles</label>
          <input type="number" name="hidesQuantity" min="1" required />
        </div>

        <div className="field">
          <label>Peso recibido (kg)</label>
          <input type="number" step="0.001" name="weightKg" min="0.001" required />
        </div>

        <div className="full">
          <button className="button" type="submit">Registrar recepción y crear lote</button>
        </div>
      </form>
    </>
  );
}
