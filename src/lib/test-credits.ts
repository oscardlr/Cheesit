/** Temporary local allowance. Remove NEXT_PUBLIC_TEST_CREDITS for the final build. */
const configured=Number(process.env.NEXT_PUBLIC_TEST_CREDITS??0);
export const TEST_CREDITS=Number.isSafeInteger(configured)&&configured>0?configured:0;

export function formatCreditBalance(value:number):string{
  return new Intl.NumberFormat('es-ES',value>=100000?{notation:'compact',maximumFractionDigits:1}:{maximumFractionDigits:0}).format(value);
}
