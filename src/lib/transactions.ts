import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Inserts an "Entry Fee" transaction (debit) for a user being added to a competition.
 * Does NOT throw — errors are logged but do not block the caller.
 */
export async function insertEntryFeeTransaction(
  supabase: SupabaseClient,
  {
    user_id,
    competition_id,
    created_by,
  }: { user_id: string; competition_id: number; created_by: string }
): Promise<void> {
  try {
    const { data: comp } = await supabase
      .from('competitions')
      .select('entry_fee, name')
      .eq('id', competition_id)
      .single()

    if (!comp || Number(comp.entry_fee) <= 0) return

    const { data: txType } = await supabase
      .from('transaction_types')
      .select('id')
      .eq('name', 'Entry Fee')
      .single()

    if (!txType) return

    const { error: txError } = await supabase.from('transactions').insert({
      profile_id: user_id,
      competition_id,
      type_id: txType.id,
      amount: -Number(comp.entry_fee),
      notes: `Entry fee — ${comp.name}`,
      created_by,
    })

    if (txError) console.error('Entry fee transaction error:', txError)
  } catch (err) {
    console.error('Entry fee transaction error:', err)
  }
}
