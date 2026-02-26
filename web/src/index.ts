import './elements/index.ts';
import './views/index.ts';
import './global-styles.ts';

//@ts-expect-error BigInt prototype needs toJSON for serialization
BigInt.prototype.toJSON = function () {
    return Number(this);
};
