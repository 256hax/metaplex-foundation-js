import isEqual from 'lodash.isequal';
import type { ConfirmOptions, PublicKey } from '@solana/web3.js';
import {
  createUpdateAuthorityInstruction,
  createUpdateCandyMachineInstruction,
} from '@metaplex-foundation/mpl-candy-machine';
import {
  assertSameCurrencies,
  Operation,
  OperationHandler,
  Signer,
  SOL,
  useOperation,
} from '@/types';
import { Metaplex } from '@/Metaplex';
import { TransactionBuilder } from '@/utils';
import { SendAndConfirmTransactionResponse } from '../rpcModule';
import {
  CandyMachine,
  CandyMachineConfigs,
  toCandyMachineConfigs,
  toCandyMachineInstructionData,
} from './CandyMachine';
import { NoInstructionsToSendError } from '@/errors';

// -----------------
// Operation
// -----------------

const Key = 'UpdateCandyMachineOperation' as const;
export const updateCandyMachineOperation =
  useOperation<UpdateCandyMachineOperation>(Key);
export type UpdateCandyMachineOperation = Operation<
  typeof Key,
  UpdateCandyMachineInput,
  UpdateCandyMachineOutput
>;

export type UpdateCandyMachineInputWithoutConfigs = {
  // Models and accounts.
  candyMachine: CandyMachine;
  authority?: Signer;
  newAuthority?: PublicKey;

  // Transaction Options.
  confirmOptions?: ConfirmOptions;
};

export type UpdateCandyMachineInput = UpdateCandyMachineInputWithoutConfigs &
  Partial<CandyMachineConfigs>;

export type UpdateCandyMachineOutput = {
  response: SendAndConfirmTransactionResponse;
};

// -----------------
// Handler
// -----------------

export const updateCandyMachineOperationHandler: OperationHandler<UpdateCandyMachineOperation> =
  {
    async handle(
      operation: UpdateCandyMachineOperation,
      metaplex: Metaplex
    ): Promise<UpdateCandyMachineOutput> {
      const builder = updateCandyMachineBuilder(metaplex, operation.input);

      if (builder.isEmpty()) {
        throw new NoInstructionsToSendError(Key);
      }

      return builder.sendAndConfirm(metaplex, operation.input.confirmOptions);
    },
  };

// -----------------
// Builder
// -----------------

export type UpdateCandyMachineBuilderParams = Omit<
  UpdateCandyMachineInput,
  'confirmOptions'
> & {
  updateInstructionKey?: string;
  updateAuthorityInstructionKey?: string;
};

export const updateCandyMachineBuilder = (
  metaplex: Metaplex,
  params: UpdateCandyMachineBuilderParams
): TransactionBuilder => {
  const {
    candyMachine,
    authority = metaplex.identity(),
    newAuthority,
    updateInstructionKey,
    updateAuthorityInstructionKey,
    ...updatableFields
  } = params;
  const currentConfigs = toCandyMachineConfigs(candyMachine);
  const instructionDataWithoutChanges = toCandyMachineInstructionData(
    candyMachine.address,
    currentConfigs
  );
  const instructionData = toCandyMachineInstructionData(candyMachine.address, {
    ...currentConfigs,
    ...updatableFields,
  });
  const { data, wallet, tokenMint } = instructionData;
  const shouldSendUpdateInstruction = !isEqual(
    instructionData,
    instructionDataWithoutChanges
  );
  const shouldSendUpdateAuthorityInstruction =
    !!newAuthority && !newAuthority.equals(authority.publicKey);

  const updateInstruction = createUpdateCandyMachineInstruction(
    {
      candyMachine: candyMachine.address,
      authority: authority.publicKey,
      wallet,
    },
    { data }
  );

  if (tokenMint) {
    updateInstruction.keys.push({
      pubkey: tokenMint,
      isWritable: false,
      isSigner: false,
    });
  } else if (params.price) {
    assertSameCurrencies(params.price, SOL);
  }

  return (
    TransactionBuilder.make()

      // Update data.
      .when(shouldSendUpdateInstruction, (builder) =>
        builder.add({
          instruction: updateInstruction,
          signers: [authority],
          key: updateInstructionKey ?? 'update',
        })
      )

      // Update authority.
      .when(shouldSendUpdateAuthorityInstruction, (builder) =>
        builder.add({
          instruction: createUpdateAuthorityInstruction(
            {
              candyMachine: candyMachine.address,
              authority: authority.publicKey,
              wallet: candyMachine.walletAddress,
            },
            { newAuthority: newAuthority as PublicKey }
          ),
          signers: [authority],
          key: updateAuthorityInstructionKey ?? 'updateAuthority',
        })
      )
  );
};
