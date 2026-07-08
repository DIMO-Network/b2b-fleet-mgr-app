import { msg } from '@lit/localize';

// Inventory state values as stored by kaufmann-oracle in vin_inventory_states.
// Keep in sync with internal/inventory/inventory.go in the oracle repo.
export const INVENTORY_STATE_INVENTORY = 'Inventory';
export const INVENTORY_STATE_CUSTOMER = 'Customer';
export const INVENTORY_STATE_DEALER_INVENTORY = 'DealerInventory';

export function inventoryStateLabel(state: string): string {
  switch (state) {
    case INVENTORY_STATE_INVENTORY:
      return msg('Inventory');
    case INVENTORY_STATE_CUSTOMER:
      return msg('Customer');
    case INVENTORY_STATE_DEALER_INVENTORY:
      return msg('Dealer Inventory / Standby');
    default:
      return state;
  }
}

export function inventoryStateClass(state: string): string {
  return state ? `status-${state.toLowerCase()}` : '';
}
