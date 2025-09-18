use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

// Native SOL mint address (wrapped SOL)
const NATIVE_SOL_MINT: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
// use spl_token::state::Account as TokenAccount; // Unused import
use std::str::FromStr;
use borsh::{BorshDeserialize, BorshSerialize};
use shank::{ShankInstruction, ShankAccount};

// Program ID
solana_program::declare_id!("EtGrXaRpEdozMtfd8tbkbrbDN8LqZNba3xWTdT3HtQWq");

// GorbChain SPL Token Program ID
const GORBCHAIN_SPL_TOKEN_PROGRAM: &str = "G22oYgZ6LnVcy7v8eSNi2xpNk1NcZiPD8CVKSTut7oZ6";

// Manual instruction creation for GorbChain SPL Token program
fn create_transfer_instruction(
    source: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(3); // Transfer instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };
    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*source, false),
            solana_program::instruction::AccountMeta::new(*destination, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_mint_to_instruction(
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(7); // MintTo instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };
    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*mint, false),
            solana_program::instruction::AccountMeta::new(*destination, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_burn_instruction(
    account: &Pubkey,
    mint: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(8); // Burn instruction discriminator
        buf.extend_from_slice(&amount.to_le_bytes());
        buf
    };
    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*account, false),
            solana_program::instruction::AccountMeta::new(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_initialize_account_instruction(
    account: &Pubkey,
    mint: &Pubkey,
    authority: &Pubkey,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(1); // InitializeAccount instruction discriminator
        buf
    };
    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*account, false),
            solana_program::instruction::AccountMeta::new_readonly(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(*authority, false),
            solana_program::instruction::AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
        ],
        data,
    }
}

// InitializeMint instruction for GorbChain SPL Token program
fn create_initialize_mint_instruction(
    mint: &Pubkey,
    decimals: u8,
    mint_authority: &Pubkey,
    freeze_authority: Option<&Pubkey>,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(0); // InitializeMint instruction discriminator
        buf.push(decimals);
        buf.extend_from_slice(mint_authority.as_ref());
        if let Some(freeze) = freeze_authority {
            buf.push(1);
            buf.extend_from_slice(freeze.as_ref());
        } else {
            buf.push(0);
        }
        buf
    };
    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
        ],
        data,
    }
}

// Create Associated Token Account instruction for GorbChain SPL Token program
fn create_associated_token_account_instruction(
    payer: &Pubkey,
    associated_token: &Pubkey,
    owner: &Pubkey,
    mint: &Pubkey,
) -> solana_program::instruction::Instruction {
    let data = {
        let mut buf = Vec::new();
        buf.push(0); // CreateAssociatedTokenAccount instruction discriminator
        buf
    };
    solana_program::instruction::Instruction {
        program_id: Pubkey::from_str("GoATGVNeSXerFerPqTJ8hcED1msPWHHLxao2vwBYqowm").unwrap(), // ATA Program ID
        accounts: vec![
            solana_program::instruction::AccountMeta::new(*payer, true),
            solana_program::instruction::AccountMeta::new(*associated_token, false),
            solana_program::instruction::AccountMeta::new_readonly(*owner, false),
            solana_program::instruction::AccountMeta::new_readonly(*mint, false),
            solana_program::instruction::AccountMeta::new_readonly(solana_program::sysvar::rent::id(), false),
            solana_program::instruction::AccountMeta::new_readonly(Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(), false),
            solana_program::instruction::AccountMeta::new_readonly(solana_program::system_program::id(), false),
        ],
        data,
    }
}

// Helper function to derive vault PDAs
fn get_vault_address(pool: &Pubkey, token_mint: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"vault", pool.as_ref(), token_mint.as_ref()],
        program_id,
    )
}

// Entry point
entrypoint!(process_instruction);

// Instructions
#[derive(BorshSerialize, BorshDeserialize, Debug, ShankInstruction)]
pub enum TestProjectInstruction {
    InitPool { amount_a: u64, amount_b: u64 },
    AddLiquidity { amount_a: u64, amount_b: u64 },
    RemoveLiquidity { lp_amount: u64 },
    Swap { amount_in: u64, direction_a_to_b: bool },
    MultihopSwap { amount_in: u64, minimum_amount_out: u64 },
    MultihopSwapWithPath { amount_in: u64, minimum_amount_out: u64, token_path: Vec<Pubkey> },
    CollectFees { pool: Pubkey },
    WithdrawFees { pool: Pubkey, amount_a: u64, amount_b: u64 },
    SetFeeTreasury { pool: Pubkey, treasury: Pubkey },
}

// Pool state
#[derive(BorshSerialize, BorshDeserialize, Debug, ShankAccount)]
pub struct Pool {
    pub token_a: Pubkey,
    pub token_b: Pubkey,
    pub bump: u8,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub total_lp_supply: u64,
    pub fee_collected_a: u64,
    pub fee_collected_b: u64,
    pub fee_treasury: Pubkey,
}

impl Sealed for Pool {}

impl IsInitialized for Pool {
    fn is_initialized(&self) -> bool {
        self.token_a != Pubkey::default()
    }
}

impl Pack for Pool {
    const LEN: usize = 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 32; // 137 bytes
    
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let pool = Pool::try_from_slice(src)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        Ok(pool)
    }
    
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }
}

// Native SOL Pool state
#[derive(BorshSerialize, BorshDeserialize, Debug, ShankAccount)]
pub struct NativeSOLPool {
    pub token_a: Pubkey,     // Native SOL address (So11111111111111111111111111111111111111112)
    pub token_b: Pubkey,     // The SPL token mint
    pub bump: u8,
    pub reserve_a: u64,      // Native SOL reserve
    pub reserve_b: u64,      // SPL token reserve
    pub total_lp_supply: u64,
    pub fee_collected_sol: u64,
    pub fee_collected_token: u64,
    pub fee_treasury: Pubkey,
    pub token_mint: Pubkey,  // The SPL token mint (same as token_b for convenience)
}

impl Sealed for NativeSOLPool {}

impl IsInitialized for NativeSOLPool {
    fn is_initialized(&self) -> bool {
        self.token_a != Pubkey::default()
    }
}

impl Pack for NativeSOLPool {
    const LEN: usize = 32 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 32 + 32; // 169 bytes
    
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let pool = NativeSOLPool::try_from_slice(src)
            .map_err(|_| ProgramError::InvalidAccountData)?;
        Ok(pool)
    }
    
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let data = self.try_to_vec().unwrap();
        dst[..data.len()].copy_from_slice(&data);
    }
}

// Program instruction processor
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = TestProjectInstruction::try_from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;
        
    match instruction {
        TestProjectInstruction::InitPool { amount_a, amount_b } => {
            process_init_pool(program_id, accounts, amount_a, amount_b)
        }
        TestProjectInstruction::AddLiquidity { amount_a, amount_b } => {
            process_add_liquidity(program_id, accounts, amount_a, amount_b)
        }
        TestProjectInstruction::RemoveLiquidity { lp_amount } => {
            process_remove_liquidity(program_id, accounts, lp_amount)
        }
        TestProjectInstruction::Swap { amount_in, direction_a_to_b } => {
            process_swap(program_id, accounts, amount_in, direction_a_to_b)
        }
        TestProjectInstruction::MultihopSwap { amount_in, minimum_amount_out } => {
            process_multihop_swap(program_id, accounts, amount_in, minimum_amount_out)
        }
        TestProjectInstruction::MultihopSwapWithPath { amount_in, minimum_amount_out, token_path } => {
            process_multihop_swap_with_path(program_id, accounts, amount_in, minimum_amount_out, token_path)
        }
        TestProjectInstruction::CollectFees { pool } => {
            process_collect_fees(program_id, accounts, pool)
        }
        TestProjectInstruction::WithdrawFees { pool, amount_a, amount_b } => {
            process_withdraw_fees(program_id, accounts, pool, amount_a, amount_b)
        }
        TestProjectInstruction::SetFeeTreasury { pool, treasury } => {
            process_set_fee_treasury(program_id, accounts, pool, treasury)
        }
    }
}

fn process_init_pool(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    let rent_info = next_account_info(account_info_iter)?;

    // Check if this is a native SOL pool initialization
    let is_native_sol_pool = *token_a_info.key == NATIVE_SOL_MINT || *token_b_info.key == NATIVE_SOL_MINT;
    
    if is_native_sol_pool {
        // Native SOL pool initialization logic
        solana_program::log::sol_log("InitNativeSOLPool instruction called");
        
        // Determine which token is SOL and which is the SPL token
        let (sol_amount, token_amount, token_mint) = if *token_a_info.key == NATIVE_SOL_MINT {
            (amount_a, amount_b, *token_b_info.key)
    } else {
            (amount_b, amount_a, *token_a_info.key)
        };

        // Derive pool PDA for native SOL pool
        let (pool_pda, _pool_bump) = Pubkey::find_program_address(
            &[b"native_sol_pool", &token_mint.as_ref()],
            program_id,
        );

        // Verify pool account
        if pool_info.key != &pool_pda {
        return Err(ProgramError::InvalidSeeds);
    }

        // Derive LP mint PDA
        let (lp_mint_pda, _lp_mint_bump) = Pubkey::find_program_address(
            &[b"native_sol_lp_mint", pool_pda.as_ref()],
            program_id,
        );

        // Verify LP mint
        if lp_mint_info.key != &lp_mint_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        // Derive pool token vault PDA
        let (pool_token_vault_pda, _pool_token_vault_bump) = Pubkey::find_program_address(
            &[b"native_sol_vault", pool_pda.as_ref(), &token_mint.as_ref()],
            program_id,
        );

        // Verify pool token vault
        if vault_b_info.key != &pool_token_vault_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        // Check if pool account is already initialized
        if !pool_info.data_is_empty() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        let rent_sysvar = Rent::from_account_info(rent_info)?;
        let pool_space = NativeSOLPool::LEN;
        let vault_space = 165; // Token account size
        let mint_space = 82; // Mint account size
        let pool_lamports = rent_sysvar.minimum_balance(pool_space);
        let vault_lamports = rent_sysvar.minimum_balance(vault_space);
        let mint_lamports = rent_sysvar.minimum_balance(mint_space);

        // Create pool account
        let pool_signer_seeds: &[&[_]] = &[
            b"native_sol_pool",
            &token_mint.as_ref(),
            &[_pool_bump],
        ];

        invoke_signed(
            &system_instruction::create_account(
                user_info.key,
                pool_info.key,
                pool_lamports + sol_amount, // Include SOL reserve
                pool_space as u64,
                program_id,
            ),
            &[
                user_info.clone(),
                pool_info.clone(),
                system_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;

        // Create pool token vault
        let vault_signer_seeds: &[&[_]] = &[
            b"native_sol_vault",
            pool_pda.as_ref(),
            &token_mint.as_ref(),
            &[_pool_token_vault_bump],
        ];

        invoke_signed(
            &system_instruction::create_account(
                user_info.key,
                vault_b_info.key,
                vault_lamports,
                vault_space as u64,
                &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
            ),
            &[
                user_info.clone(),
                vault_b_info.clone(),
                system_program_info.clone(),
            ],
            &[vault_signer_seeds],
        )?;

        // Initialize pool token vault as token account
        invoke_signed(
            &create_initialize_account_instruction(
                vault_b_info.key,
                &token_mint,
                vault_b_info.key, // Vault is its own authority
            ),
            &[
                vault_b_info.clone(),
                token_b_info.clone(),
                vault_b_info.clone(),
                rent_info.clone(),
            ],
            &[vault_signer_seeds],
        )?;

        // Create LP mint account
        let lp_mint_signer_seeds: &[&[_]] = &[
            b"native_sol_lp_mint",
            pool_pda.as_ref(),
            &[_lp_mint_bump],
        ];

        invoke_signed(
            &system_instruction::create_account(
                user_info.key,
                lp_mint_info.key,
                mint_lamports,
                mint_space as u64,
                &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
            ),
            &[
                user_info.clone(),
                lp_mint_info.clone(),
                system_program_info.clone(),
            ],
            &[lp_mint_signer_seeds],
        )?;

        // Initialize LP mint
        invoke_signed(
            &create_initialize_mint_instruction(
                lp_mint_info.key,
                0, // decimals (0 for LP token)
                pool_info.key, // mint authority is pool
                None,          // no freeze authority
            ),
            &[
                lp_mint_info.clone(),
                rent_info.clone(),
            ],
            &[lp_mint_signer_seeds],
        )?;

        // Transfer tokens to pool vault
        invoke(
            &create_transfer_instruction(
                user_token_b_info.key,
                vault_b_info.key,
                user_info.key,
                token_amount,
            ),
            &[
                user_token_b_info.clone(),
                vault_b_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        // Create user LP ATA if it doesn't exist
        invoke(
            &create_associated_token_account_instruction(
                user_info.key,
                user_lp_info.key,
                user_info.key,
                lp_mint_info.key,
            ),
            &[
                user_info.clone(),
                user_lp_info.clone(),
                user_info.clone(),
                lp_mint_info.clone(),
                rent_info.clone(),
                token_program_info.clone(),
                system_program_info.clone(),
            ],
        )?;

        // Calculate initial liquidity (geometric mean)
        let liquidity: u64 = (sol_amount as u128)
            .checked_mul(token_amount as u128)
            .unwrap()
            .integer_sqrt() as u64;

        // Mint LP tokens to user
        invoke_signed(
            &create_mint_to_instruction(
                lp_mint_info.key,
                user_lp_info.key,
                pool_info.key,
                liquidity,
            ),
            &[
                lp_mint_info.clone(),
                user_lp_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;

        // Initialize pool state
        let pool = NativeSOLPool {
            token_a: NATIVE_SOL_MINT,
            token_b: token_mint,
            bump: _pool_bump,
            reserve_a: sol_amount,
            reserve_b: token_amount,
            total_lp_supply: liquidity,
            fee_collected_sol: 0,
            fee_collected_token: 0,
            fee_treasury: Pubkey::default(), // Will be set later via SetFeeTreasury
            token_mint: token_mint,
        };

        let mut pool_data = pool_info.try_borrow_mut_data()?;
        if pool_data.len() < NativeSOLPool::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        pool.pack_into_slice(&mut pool_data[..NativeSOLPool::LEN]);

        solana_program::log::sol_log(&format!("Pool initialized with {} SOL and {} tokens, {} LP tokens minted", sol_amount, token_amount, liquidity));

        return Ok(());
    }

    // Derive pool address and bump
    let (pool_pubkey, _pool_bump) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );
    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Derive vault addresses and verify them
    let (vault_a_pubkey, vault_a_bump) = get_vault_address(&pool_pubkey, token_a_info.key, program_id);
    let (vault_b_pubkey, vault_b_bump) = get_vault_address(&pool_pubkey, token_b_info.key, program_id);
    
    if vault_a_pubkey != *vault_a_info.key {
        return Err(ProgramError::InvalidSeeds);
    }
    if vault_b_pubkey != *vault_b_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let rent = Rent::from_account_info(rent_info)?;
    let pool_space = Pool::LEN;
    let vault_space = 165; // Token account size
    let pool_lamports = rent.minimum_balance(pool_space);
    let vault_lamports = rent.minimum_balance(vault_space);

    // Create pool account
    let pool_signer_seeds: &[&[_]] = &[
            b"pool",
            token_a_info.key.as_ref(),
            token_b_info.key.as_ref(),
            &[_pool_bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            pool_info.key,
            pool_lamports,
            pool_space as u64,
            program_id,
        ),
        &[
            user_info.clone(),
            pool_info.clone(),
            system_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Create vault A as PDA
    let vault_a_signer_seeds: &[&[_]] = &[
            b"vault",
            pool_info.key.as_ref(),
            token_a_info.key.as_ref(),
            &[vault_a_bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            vault_a_info.key,
            vault_lamports,
            vault_space as u64,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            vault_a_info.clone(),
            system_program_info.clone(),
        ],
        &[vault_a_signer_seeds],
    )?;

    // Create vault B as PDA
        let vault_b_signer_seeds: &[&[_]] = &[
            b"vault",
            pool_info.key.as_ref(),
            token_b_info.key.as_ref(),
            &[vault_b_bump],
        ];

        invoke_signed(
            &system_instruction::create_account(
                user_info.key,
                vault_b_info.key,
                vault_lamports,
                vault_space as u64,
                &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
            ),
            &[
                user_info.clone(),
                vault_b_info.clone(),
                system_program_info.clone(),
            ],
            &[vault_b_signer_seeds],
        )?;

    // Initialize vault A as token account
    invoke_signed(
        &create_initialize_account_instruction(
            vault_a_info.key,
            token_a_info.key,
            vault_a_info.key, // Vault is its own authority
        ),
        &[
            vault_a_info.clone(),
            token_a_info.clone(),
            vault_a_info.clone(),
            rent_info.clone(),
        ],
        &[vault_a_signer_seeds],
    )?;

    // Initialize vault B as token account
        invoke_signed(
            &create_initialize_account_instruction(
                vault_b_info.key,
                token_b_info.key,
                vault_b_info.key, // Vault is its own authority
            ),
            &[
                vault_b_info.clone(),
                token_b_info.clone(),
                vault_b_info.clone(),
                rent_info.clone(),
            ],
            &[vault_b_signer_seeds],
        )?;

    // Create LP mint account
    let mint_space = 82; // Mint account size
    let mint_lamports = rent.minimum_balance(mint_space);
    let (lp_mint_pubkey, _lp_mint_bump) = Pubkey::find_program_address(
            &[b"mint", pool_info.key.as_ref()],
            program_id,
    );
    if lp_mint_pubkey != *lp_mint_info.key {
        return Err(ProgramError::InvalidSeeds);
    }
    let lp_mint_signer_seeds: &[&[_]] = &[
            b"mint",
            pool_info.key.as_ref(),
            &[_lp_mint_bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            user_info.key,
            lp_mint_info.key,
            mint_lamports,
            mint_space as u64,
            &Pubkey::from_str(GORBCHAIN_SPL_TOKEN_PROGRAM).unwrap(),
        ),
        &[
            user_info.clone(),
            lp_mint_info.clone(),
            system_program_info.clone(),
        ],
        &[lp_mint_signer_seeds],
    )?;

    // Initialize LP mint as token mint
    invoke_signed(
        &create_initialize_mint_instruction(
            lp_mint_info.key,
            0, // decimals (0 for LP token)
            pool_info.key, // mint authority is pool
            None,          // no freeze authority
        ),
        &[
            lp_mint_info.clone(),
            rent_info.clone(),
        ],
        &[lp_mint_signer_seeds],
    )?;

    // Transfer tokens to vaults
        invoke(
            &create_transfer_instruction(
                user_token_a_info.key,
                vault_a_info.key,
                user_info.key,
                amount_a,
            ),
            &[
                user_token_a_info.clone(),
                vault_a_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        invoke(
            &create_transfer_instruction(
                user_token_b_info.key,
                vault_b_info.key,
                user_info.key,
                amount_b,
            ),
            &[
                user_token_b_info.clone(),
                vault_b_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;

    // Create user LP ATA if it doesn't exist
    invoke(
        &create_associated_token_account_instruction(
            user_info.key,
            user_lp_info.key,
            user_info.key,
            lp_mint_info.key,
        ),
        &[
            user_info.clone(),
            user_lp_info.clone(),
            user_info.clone(),
            lp_mint_info.clone(),
            rent_info.clone(),
            token_program_info.clone(),
            system_program_info.clone(),
        ],
    )?;

    // Calculate liquidity
    let liquidity: u64 = (amount_a as u128)
        .checked_mul(amount_b as u128)
        .unwrap()
        .integer_sqrt() as u64;

    // Mint LP tokens
    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Initialize pool state
        let pool = Pool {
            token_a: *token_a_info.key,
            token_b: *token_b_info.key,
            bump: _pool_bump,
            reserve_a: amount_a,
            reserve_b: amount_b,
            total_lp_supply: liquidity,
            fee_collected_a: 0,
            fee_collected_b: 0,
            fee_treasury: Pubkey::default(), // Will be set later via SetFeeTreasury
        };
        Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_add_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    // Check if this is a native SOL pool add liquidity
    let is_native_sol_pool = *token_a_info.key == NATIVE_SOL_MINT || *token_b_info.key == NATIVE_SOL_MINT;
    
    if is_native_sol_pool {
        // Native SOL pool add liquidity logic
        solana_program::log::sol_log("AddLiquidityNativeSOL instruction called");
        
        // Determine which token is SOL and which is the SPL token
        let (sol_amount, token_amount, token_mint) = if *token_a_info.key == NATIVE_SOL_MINT {
            (amount_a, amount_b, *token_b_info.key)
    } else {
            (amount_b, amount_a, *token_a_info.key)
        };

        solana_program::log::sol_log(&format!("SOL amount: {}", sol_amount));
        solana_program::log::sol_log(&format!("Token amount: {}", token_amount));

        // Load pool state
        let mut pool = NativeSOLPool::unpack(&pool_info.data.borrow())?;
        
        // Verify pool seeds
        let (pool_pda, _pool_bump) = Pubkey::find_program_address(
            &[b"native_sol_pool", &token_mint.as_ref()],
            program_id,
        );
        if pool_info.key != &pool_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        // Verify pool token vault
        let (pool_token_vault_pda, _pool_token_vault_bump) = Pubkey::find_program_address(
            &[b"native_sol_vault", pool_pda.as_ref(), &token_mint.as_ref()],
            program_id,
        );
        if vault_b_info.key != &pool_token_vault_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        // Verify LP mint
        let (lp_mint_pda, _lp_mint_bump) = Pubkey::find_program_address(
            &[b"native_sol_lp_mint", pool_pda.as_ref()],
            program_id,
        );
        if lp_mint_info.key != &lp_mint_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        // Calculate final amounts maintaining ratio
        let (final_amount_sol, final_amount_token) = if pool.reserve_a > 0 && pool.reserve_b > 0 {
            let required_token = (sol_amount as u128)
                .checked_mul(pool.reserve_b as u128).unwrap()
                .checked_div(pool.reserve_a as u128).unwrap() as u64;
            if required_token <= token_amount {
                (sol_amount, required_token)
            } else {
                let required_sol = (token_amount as u128)
                    .checked_mul(pool.reserve_a as u128).unwrap()
                    .checked_div(pool.reserve_b as u128).unwrap() as u64;
                (required_sol, token_amount)
            }
        } else {
            (sol_amount, token_amount)
        };

        // Transfer SOL to pool using system program
        invoke(
            &system_instruction::transfer(
                user_info.key,
                pool_info.key,
                final_amount_sol,
            ),
            &[
                user_info.clone(),
                pool_info.clone(),
                user_info.clone(), // system program
            ],
        )?;

        // Transfer tokens from user to pool vault
        invoke(
            &create_transfer_instruction(
                user_token_b_info.key,
                vault_b_info.key,
                user_info.key,
                final_amount_token,
            ),
            &[
                user_token_b_info.clone(),
                vault_b_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;

        // Calculate liquidity to mint
        let liquidity = if pool.total_lp_supply == 0 {
            (final_amount_sol as u128)
                .checked_mul(final_amount_token as u128).unwrap()
                .integer_sqrt() as u64
        } else {
            (final_amount_sol as u128)
                .checked_mul(pool.total_lp_supply as u128).unwrap()
                .checked_div(pool.reserve_a as u128).unwrap() as u64
        };

        // Mint LP tokens
        let pool_signer_seeds: &[&[_]] = &[
            b"native_sol_pool",
            &token_mint.as_ref(),
            &[_pool_bump],
        ];
        
        invoke_signed(
            &create_mint_to_instruction(
                lp_mint_info.key,
                user_lp_info.key,
                pool_info.key,
                liquidity,
            ),
            &[
                lp_mint_info.clone(),
                user_lp_info.clone(),
                pool_info.clone(),
                token_program_info.clone(),
            ],
            &[pool_signer_seeds],
        )?;

        // Update pool state
        pool.reserve_a = pool.reserve_a.checked_add(final_amount_sol).unwrap();
        pool.reserve_b = pool.reserve_b.checked_add(final_amount_token).unwrap();
        pool.total_lp_supply = pool.total_lp_supply.checked_add(liquidity).unwrap();
        
        // Pack updated pool state
        let mut pool_data = pool_info.try_borrow_mut_data()?;
        pool.pack_into_slice(&mut pool_data[..NativeSOLPool::LEN]);

        // Refund unused tokens back to user
        if sol_amount > final_amount_sol {
            let excess_sol = sol_amount - final_amount_sol;
            **pool_info.try_borrow_mut_lamports()? -= excess_sol;
            **user_info.try_borrow_mut_lamports()? += excess_sol;
        }

        if token_amount > final_amount_token {
            let excess_token = token_amount - final_amount_token;
            let vault_signer_seeds: &[&[_]] = &[
                b"native_sol_vault",
                pool_pda.as_ref(),
                &token_mint.as_ref(),
                &[_pool_token_vault_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    vault_b_info.key,
                    user_token_b_info.key,
                    vault_b_info.key,
                    excess_token,
                ),
                &[
                    vault_b_info.clone(),
                    user_token_b_info.clone(),
                    vault_b_info.clone(),
                    token_program_info.clone(),
                ],
                &[vault_signer_seeds],
            )?;
        }

        solana_program::log::sol_log(&format!("Liquidity added: {} SOL, {} tokens, {} LP tokens minted", final_amount_sol, final_amount_token, liquidity));
        
        return Ok(());
    }

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;
    
    // Store token addresses before pool is moved
    let token_a = pool.token_a;
    let token_b = pool.token_b;
    
    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );
    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Verify vault addresses and get bumps
    let (vault_a_pubkey, vault_a_bump) = get_vault_address(pool_info.key, &token_a, program_id);
    let (vault_b_pubkey, vault_b_bump) = get_vault_address(pool_info.key, &token_b, program_id);
    
    if vault_a_pubkey != *vault_a_info.key || vault_b_pubkey != *vault_b_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate final amounts maintaining ratio
    let (final_amount_a, final_amount_b) = if reserve_a > 0 && reserve_b > 0 {
        let required_b = (amount_a as u128)
            .checked_mul(reserve_b as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64;
        if required_b <= amount_b {
            (amount_a, required_b)
        } else {
            let required_a = (amount_b as u128)
                .checked_mul(reserve_a as u128).unwrap()
                .checked_div(reserve_b as u128).unwrap() as u64;
            (required_a, amount_b)
        }
    } else {
        (amount_a, amount_b)
    };

    // Transfer tokens to vaults
    invoke(
        &create_transfer_instruction(
            user_token_a_info.key,
            vault_a_info.key,
            user_info.key,
            final_amount_a,
        ),
        &[
            user_token_a_info.clone(),
            vault_a_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    invoke(
        &create_transfer_instruction(
            user_token_b_info.key,
            vault_b_info.key,
            user_info.key,
            final_amount_b,
        ),
        &[
            user_token_b_info.clone(),
            vault_b_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Calculate liquidity to mint
    let liquidity = if supply == 0 {
        (final_amount_a as u128)
            .checked_mul(final_amount_b as u128).unwrap()
            .integer_sqrt() as u64
    } else {
        (final_amount_a as u128)
            .checked_mul(supply as u128).unwrap()
            .checked_div(reserve_a as u128).unwrap() as u64
    };

    // Mint LP tokens
    let pool_signer_seeds: &[&[_]] = &[
        b"pool",
        pool.token_a.as_ref(),
        pool.token_b.as_ref(),
        &[pool.bump],
    ];
    
    invoke_signed(
        &create_mint_to_instruction(
            lp_mint_info.key,
            user_lp_info.key,
            pool_info.key,
            liquidity,
        ),
        &[
            lp_mint_info.clone(),
            user_lp_info.clone(),
            pool_info.clone(),
            token_program_info.clone(),
        ],
        &[pool_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_add(final_amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_add(final_amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_add(liquidity).unwrap();
    
    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    // Refund unused tokens back to user (Uniswap pattern)
    // If user provided more than the calculated final amount, return the excess
    if amount_a > final_amount_a {
        let excess_a = amount_a - final_amount_a;
        let vault_a_signer_seeds: &[&[_]] = &[
            b"vault",
            pool_info.key.as_ref(),
            &token_a.as_ref(),
            &[vault_a_bump],
        ];
        
        invoke_signed(
            &create_transfer_instruction(
                vault_a_info.key,
                user_token_a_info.key,
                vault_a_info.key,
                excess_a,
            ),
            &[
                vault_a_info.clone(),
                user_token_a_info.clone(),
                vault_a_info.clone(),
                token_program_info.clone(),
            ],
            &[vault_a_signer_seeds],
        )?;
    }

    if amount_b > final_amount_b {
        let excess_b = amount_b - final_amount_b;
        let vault_b_signer_seeds: &[&[_]] = &[
            b"vault",
            pool_info.key.as_ref(),
            &token_b.as_ref(),
            &[vault_b_bump],
        ];
        
        invoke_signed(
            &create_transfer_instruction(
                vault_b_info.key,
                user_token_b_info.key,
                vault_b_info.key,
                excess_b,
            ),
            &[
                vault_b_info.clone(),
                user_token_b_info.clone(),
                vault_b_info.clone(),
                token_program_info.clone(),
            ],
            &[vault_b_signer_seeds],
        )?;
    }

    Ok(())
}

fn process_remove_liquidity(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    lp_amount: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let lp_mint_info = next_account_info(account_info_iter)?;
    let user_lp_info = next_account_info(account_info_iter)?;
    let user_token_a_info = next_account_info(account_info_iter)?;
    let user_token_b_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    // Check if this is a native SOL pool remove liquidity
    let is_native_sol_pool = *token_a_info.key == NATIVE_SOL_MINT || *token_b_info.key == NATIVE_SOL_MINT;
    
    if is_native_sol_pool {
        // Native SOL pool remove liquidity logic
        solana_program::log::sol_log("RemoveLiquidityNativeSOL instruction called");
        solana_program::log::sol_log(&format!("LP amount: {}", lp_amount));
        
        // Determine which token is SOL and which is the SPL token
        let token_mint = if *token_a_info.key == NATIVE_SOL_MINT {
            *token_b_info.key
        } else {
            *token_a_info.key
        };

        // Load pool state
    let mut pool = NativeSOLPool::unpack(&pool_info.data.borrow())?;
    
    // Verify pool seeds
        let (pool_pda, _pool_bump) = Pubkey::find_program_address(
            &[b"native_sol_pool", &token_mint.as_ref()],
        program_id,
    );
        if pool_info.key != &pool_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    // Verify pool token vault
    let (pool_token_vault_pda, _pool_token_vault_bump) = Pubkey::find_program_address(
            &[b"native_sol_vault", pool_pda.as_ref(), &token_mint.as_ref()],
        program_id,
    );
        if vault_b_info.key != &pool_token_vault_pda {
        return Err(ProgramError::InvalidSeeds);
    }

    // Verify LP mint
    let (lp_mint_pda, _lp_mint_bump) = Pubkey::find_program_address(
            &[b"native_sol_lp_mint", pool_pda.as_ref()],
        program_id,
    );
    if lp_mint_info.key != &lp_mint_pda {
        return Err(ProgramError::InvalidSeeds);
    }

        let sol_reserve = pool.reserve_a;
        let token_reserve = pool.reserve_b;
        let supply = pool.total_lp_supply;

        // Calculate amounts to withdraw
        let amount_sol = (lp_amount as u128)
            .checked_mul(sol_reserve as u128).unwrap()
            .checked_div(supply as u128).unwrap() as u64;
        let amount_token = (lp_amount as u128)
            .checked_mul(token_reserve as u128).unwrap()
            .checked_div(supply as u128).unwrap() as u64;

        // Burn LP tokens
    invoke(
            &create_burn_instruction(
                user_lp_info.key,
                lp_mint_info.key,
            user_info.key,
                lp_amount,
        ),
        &[
                user_lp_info.clone(),
                lp_mint_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

        // Transfer SOL from pool to user
        **pool_info.try_borrow_mut_lamports()? -= amount_sol;
        **user_info.try_borrow_mut_lamports()? += amount_sol;

        // Transfer tokens from pool vault to user using vault PDA as authority
        let vault_signer_seeds: &[&[_]] = &[
            b"native_sol_vault",
            pool_pda.as_ref(),
            &token_mint.as_ref(),
            &[_pool_token_vault_bump],
        ];
        
        invoke_signed(
            &create_transfer_instruction(
                vault_b_info.key,
                user_token_b_info.key,
                vault_b_info.key,
                amount_token,
            ),
            &[
                vault_b_info.clone(),
                user_token_b_info.clone(),
                vault_b_info.clone(),
                token_program_info.clone(),
            ],
            &[vault_signer_seeds],
        )?;

        // Update pool state
        pool.reserve_a = pool.reserve_a.checked_sub(amount_sol).unwrap();
        pool.reserve_b = pool.reserve_b.checked_sub(amount_token).unwrap();
        pool.total_lp_supply = pool.total_lp_supply.checked_sub(lp_amount).unwrap();
        
        // Pack updated pool state
        let mut pool_data = pool_info.try_borrow_mut_data()?;
        pool.pack_into_slice(&mut pool_data[..NativeSOLPool::LEN]);

        solana_program::log::sol_log(&format!("Liquidity removed: {} LP tokens -> {} SOL, {} tokens", lp_amount, amount_sol, amount_token));
        
        return Ok(());
    }

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;
    
    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );
    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Verify vault addresses and get bumps
    let (vault_a_pubkey, vault_a_bump) = get_vault_address(pool_info.key, &pool.token_a, program_id);
    let (vault_b_pubkey, vault_b_bump) = get_vault_address(pool_info.key, &pool.token_b, program_id);
    
    if vault_a_pubkey != *vault_a_info.key || vault_b_pubkey != *vault_b_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    let reserve_a = pool.reserve_a;
    let reserve_b = pool.reserve_b;
    let supply = pool.total_lp_supply;

    // Calculate amounts to withdraw
    let amount_a = (lp_amount as u128)
        .checked_mul(reserve_a as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;
    let amount_b = (lp_amount as u128)
        .checked_mul(reserve_b as u128).unwrap()
        .checked_div(supply as u128).unwrap() as u64;

    // Burn LP tokens
    invoke(
        &create_burn_instruction(
            user_lp_info.key,
            lp_mint_info.key,
            user_info.key,
            lp_amount,
        ),
        &[
            user_lp_info.clone(),
            lp_mint_info.clone(),
            user_info.clone(),
            token_program_info.clone(),
        ],
    )?;

    // Transfer tokens from vaults to user using vault PDA authorities
    let vault_a_signer_seeds: &[&[_]] = &[
        b"vault",
        pool_info.key.as_ref(),
        pool.token_a.as_ref(),
        &[vault_a_bump],
    ];

    let vault_b_signer_seeds: &[&[_]] = &[
        b"vault",
        pool_info.key.as_ref(),
        pool.token_b.as_ref(),
        &[vault_b_bump],
    ];

    invoke_signed(
        &create_transfer_instruction(
            vault_a_info.key,
            user_token_a_info.key,
            vault_a_info.key,
            amount_a,
        ),
        &[
            vault_a_info.clone(),
            user_token_a_info.clone(),
            vault_a_info.clone(),
            token_program_info.clone(),
        ],
        &[vault_a_signer_seeds],
    )?;

    invoke_signed(
        &create_transfer_instruction(
            vault_b_info.key,
            user_token_b_info.key,
            vault_b_info.key,
            amount_b,
        ),
        &[
            vault_b_info.clone(),
            user_token_b_info.clone(),
            vault_b_info.clone(),
            token_program_info.clone(),
        ],
        &[vault_b_signer_seeds],
    )?;

    // Update pool state
    pool.reserve_a = pool.reserve_a.checked_sub(amount_a).unwrap();
    pool.reserve_b = pool.reserve_b.checked_sub(amount_b).unwrap();
    pool.total_lp_supply = pool.total_lp_supply.checked_sub(lp_amount).unwrap();
    
    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_swap(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_in: u64,
    direction_a_to_b: bool,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let token_a_info = next_account_info(account_info_iter)?;
    let token_b_info = next_account_info(account_info_iter)?;
    let vault_a_info = next_account_info(account_info_iter)?;
    let vault_b_info = next_account_info(account_info_iter)?;
    let user_in_info = next_account_info(account_info_iter)?;
    let user_out_info = next_account_info(account_info_iter)?;
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;

    // Check if this is a native SOL pool swap
    let is_native_sol_pool = *token_a_info.key == NATIVE_SOL_MINT || *token_b_info.key == NATIVE_SOL_MINT;
    
    if is_native_sol_pool {
        // Native SOL pool swap logic
        solana_program::log::sol_log("Native SOL pool swap instruction called");
        solana_program::log::sol_log(&format!("Amount in: {}", amount_in));
        
        // Determine which token is SOL and which is the SPL token
        let (is_sol_to_token, token_mint) = if *token_a_info.key == NATIVE_SOL_MINT {
            (direction_a_to_b, *token_b_info.key)
    } else {
            (!direction_a_to_b, *token_a_info.key)
        };

        // Load pool state
        let mut pool = NativeSOLPool::unpack(&pool_info.data.borrow())?;
        
        // Verify pool seeds
        let (pool_pda, _pool_bump) = Pubkey::find_program_address(
            &[b"native_sol_pool", &token_mint.as_ref()],
            program_id,
        );
        if pool_info.key != &pool_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        // Verify pool token vault
        let (pool_token_vault_pda, _pool_token_vault_bump) = Pubkey::find_program_address(
            &[b"native_sol_vault", pool_pda.as_ref(), &token_mint.as_ref()],
            program_id,
        );
        if vault_b_info.key != &pool_token_vault_pda {
            return Err(ProgramError::InvalidSeeds);
        }

        if is_sol_to_token {
            // SOL to Token swap
            solana_program::log::sol_log("SwapNativeSOLToToken instruction called");
            
            // Calculate output amount using constant product formula with 0.3% fee
            let amount_out = calculate_swap_output(amount_in, pool.reserve_a, pool.reserve_b)?;

            // Transfer SOL from user to pool using system program
            invoke(
                &system_instruction::transfer(
                    user_info.key,
                    pool_info.key,
                    amount_in,
                ),
                &[
                    user_info.clone(),
                    pool_info.clone(),
                    user_info.clone(), // system program
                ],
            )?;

            // Transfer tokens from pool vault to user using vault PDA as authority
            let vault_signer_seeds: &[&[_]] = &[
                b"native_sol_vault",
                pool_pda.as_ref(),
                &token_mint.as_ref(),
                &[_pool_token_vault_bump],
            ];

            invoke_signed(
                &create_transfer_instruction(
                    vault_b_info.key,
                    user_out_info.key,
                    vault_b_info.key,
                    amount_out,
                ),
                &[
                    vault_b_info.clone(),
                    user_out_info.clone(),
                    vault_b_info.clone(),
                    token_program_info.clone(),
                ],
                &[vault_signer_seeds],
            )?;

            // Update pool reserves
            pool.reserve_a = pool.reserve_a.checked_add(amount_in).unwrap();
            pool.reserve_b = pool.reserve_b.checked_sub(amount_out).unwrap();
            
            // Calculate and accumulate fees (0.3% of input amount)
            let fee_amount = (amount_in as u128 * 3 / 1000) as u64;
            pool.fee_collected_sol = pool.fee_collected_sol.checked_add(fee_amount).unwrap();
            
            solana_program::log::sol_log(&format!("Native SOL->Token fee collected: {}", fee_amount));
            solana_program::log::sol_log(&format!("Swap completed: {} SOL -> {} tokens", amount_in, amount_out));
    } else {
            // Token to SOL swap
            solana_program::log::sol_log("SwapTokenToNativeSOL instruction called");
            
            // Calculate output amount using constant product formula with 0.3% fee
            let amount_out = calculate_swap_output(amount_in, pool.reserve_b, pool.reserve_a)?;

            // Transfer tokens from user to pool vault
            invoke(
                &create_transfer_instruction(
                    user_in_info.key,
                    vault_b_info.key,
                    user_info.key,
                    amount_in,
                ),
                &[
                    user_in_info.clone(),
                    vault_b_info.clone(),
                    user_info.clone(),
                    token_program_info.clone(),
                ],
            )?;

            // Transfer SOL from pool to user (direct lamport manipulation)
            **pool_info.try_borrow_mut_lamports()? -= amount_out;
            **user_info.try_borrow_mut_lamports()? += amount_out;

            // Update pool reserves
            pool.reserve_b = pool.reserve_b.checked_add(amount_in).unwrap();
            pool.reserve_a = pool.reserve_a.checked_sub(amount_out).unwrap();
            
            // Calculate and accumulate fees (0.3% of input amount)
            let fee_amount = (amount_in as u128 * 3 / 1000) as u64;
            pool.fee_collected_token = pool.fee_collected_token.checked_add(fee_amount).unwrap();
            
            solana_program::log::sol_log(&format!("Native Token->SOL fee collected: {}", fee_amount));
            solana_program::log::sol_log(&format!("Swap completed: {} tokens -> {} SOL", amount_in, amount_out));
        }
        
        // Pack updated pool state
        let mut pool_data = pool_info.try_borrow_mut_data()?;
        pool.pack_into_slice(&mut pool_data[..NativeSOLPool::LEN]);

        return Ok(());
    }

    let mut pool = Pool::unpack(&pool_info.data.borrow())?;
    
    // Verify pool seeds
    let (pool_pubkey, _) = Pubkey::find_program_address(
        &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
        program_id,
    );
    if pool_pubkey != *pool_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Verify vault addresses and get bumps
    let (vault_a_pubkey, vault_a_bump) = get_vault_address(pool_info.key, &pool.token_a, program_id);
    let (vault_b_pubkey, vault_b_bump) = get_vault_address(pool_info.key, &pool.token_b, program_id);
    
    if vault_a_pubkey != *vault_a_info.key || vault_b_pubkey != *vault_b_info.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // Transfer input tokens to vault
    if direction_a_to_b {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_a_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_a_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    } else {
        invoke(
            &create_transfer_instruction(
                user_in_info.key,
                vault_b_info.key,
                user_info.key,
                amount_in,
            ),
            &[
                user_in_info.clone(),
                vault_b_info.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
    }

    // Calculate output amount (with 0.3% fee)
    let (reserve_in, reserve_out) = if direction_a_to_b {
        (pool.reserve_a, pool.reserve_b)
    } else {
        (pool.reserve_b, pool.reserve_a)
    };
    let amount_out = calculate_swap_output(amount_in, reserve_in, reserve_out)?;

    // Transfer output tokens from vault to user using vault PDA as authority
    if direction_a_to_b {
        let vault_b_signer_seeds: &[&[_]] = &[
            b"vault",
            pool_info.key.as_ref(),
            pool.token_b.as_ref(),
            &[vault_b_bump],
        ];
        
        invoke_signed(
            &create_transfer_instruction(
                vault_b_info.key,
                user_out_info.key,
                vault_b_info.key,
                amount_out,
            ),
            &[
                vault_b_info.clone(),
                user_out_info.clone(),
                vault_b_info.clone(),
                token_program_info.clone(),
            ],
            &[vault_b_signer_seeds],
        )?;
    } else {
        let vault_a_signer_seeds: &[&[_]] = &[
            b"vault",
            pool_info.key.as_ref(),
            pool.token_a.as_ref(),
            &[vault_a_bump],
        ];
        
        invoke_signed(
            &create_transfer_instruction(
                vault_a_info.key,
                user_out_info.key,
                vault_a_info.key,
                amount_out,
            ),
            &[
                vault_a_info.clone(),
                user_out_info.clone(),
                vault_a_info.clone(),
                token_program_info.clone(),
            ],
            &[vault_a_signer_seeds],
        )?;
    }

    // Update pool reserves
    if direction_a_to_b {
        pool.reserve_a = pool.reserve_a.checked_add(amount_in).unwrap();
        pool.reserve_b = pool.reserve_b.checked_sub(amount_out).unwrap();
    } else {
        pool.reserve_b = pool.reserve_b.checked_add(amount_in).unwrap();
        pool.reserve_a = pool.reserve_a.checked_sub(amount_out).unwrap();
    }

    // Calculate and accumulate fees (0.3% of input amount)
    let fee_amount = (amount_in as u128 * 3 / 1000) as u64;
    if direction_a_to_b {
        // Fee collected in token A
        pool.fee_collected_a = pool.fee_collected_a.checked_add(fee_amount).unwrap();
    } else {
        // Fee collected in token B  
        pool.fee_collected_b = pool.fee_collected_b.checked_add(fee_amount).unwrap();
    }
    
    solana_program::log::sol_log(&format!("Fee collected: {} (direction_a_to_b: {})", fee_amount, direction_a_to_b));

    Pool::pack(pool, &mut pool_info.data.borrow_mut())?;

    Ok(())
}

fn process_multihop_swap(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_in: u64,
    minimum_amount_out: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    
    // First account is user's input token account
    let user_input_account = next_account_info(account_info_iter)?;
    
    // For simplicity, let's just handle 2 hops (X->Y->Z) for now
    // This avoids the Vec allocation which might be causing the stack issue
    
    // First hop: X -> Y
    let pool_info_1 = next_account_info(account_info_iter)?;
    let token_a_info_1 = next_account_info(account_info_iter)?;
    let token_b_info_1 = next_account_info(account_info_iter)?;
    let vault_a_info_1 = next_account_info(account_info_iter)?;
    let vault_b_info_1 = next_account_info(account_info_iter)?;
    let intermediate_account_1 = next_account_info(account_info_iter)?;
    let next_account_1 = next_account_info(account_info_iter)?;
    
    // Second hop: Y -> Z
    let pool_info_2 = next_account_info(account_info_iter)?;
    let token_a_info_2 = next_account_info(account_info_iter)?;
    let token_b_info_2 = next_account_info(account_info_iter)?;
    let vault_a_info_2 = next_account_info(account_info_iter)?;
    let vault_b_info_2 = next_account_info(account_info_iter)?;
    let intermediate_account_2 = next_account_info(account_info_iter)?;
    let output_account_2 = next_account_info(account_info_iter)?;
    
    let num_hops = 2;
    
    let mut current_amount = amount_in;
    let mut current_input_account = user_input_account;
    
    // Process each hop
    for hop in 0..num_hops {
        let (pool_info, token_a_info, token_b_info, vault_a_info, vault_b_info, intermediate_account, output_account) = if hop == 0 {
            (pool_info_1, token_a_info_1, token_b_info_1, vault_a_info_1, vault_b_info_1, intermediate_account_1, next_account_1)
        } else {
            (pool_info_2, token_a_info_2, token_b_info_2, vault_a_info_2, vault_b_info_2, intermediate_account_2, output_account_2)
        };
        
        let mut pool = Pool::unpack(&pool_info.data.borrow())?;
        
        // Verify pool seeds
        let (pool_pubkey, _) = Pubkey::find_program_address(
            &[b"pool", token_a_info.key.as_ref(), token_b_info.key.as_ref()],
            program_id,
        );
        
        if pool_pubkey != *pool_info.key {
            return Err(ProgramError::InvalidSeeds);
        }
        
        // Verify vault addresses and get bumps
        let (vault_a_pubkey, vault_a_bump) = get_vault_address(pool_info.key, &pool.token_a, program_id);
        let (vault_b_pubkey, vault_b_bump) = get_vault_address(pool_info.key, &pool.token_b, program_id);
        
        if vault_a_pubkey != *vault_a_info.key || vault_b_pubkey != *vault_b_info.key {
            return Err(ProgramError::InvalidSeeds);
        }
        
        // Determine swap direction by checking which token the user is providing
        // We need to check the token mint of the input account, not the account address
        let input_token_mint = {
            // Read the token account to get its mint
            let token_account_data = current_input_account.data.borrow();
            if token_account_data.len() < 32 {
                return Err(ProgramError::InvalidAccountData);
            }
            // Token account mint is at offset 0-32
            let mint_bytes: [u8; 32] = token_account_data[0..32]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?;
            Pubkey::new_from_array(mint_bytes)
        };
        
        let direction_a_to_b = if input_token_mint == pool.token_a {
            // User is providing token_a mint, so swap A->B
            true
        } else if input_token_mint == pool.token_b {
            // User is providing token_b mint, so swap B->A  
            false
        } else {
            return Err(ProgramError::InvalidArgument);
        };
        
        // Debug: Log the direction for troubleshooting
        solana_program::log::sol_log(&format!("Hop {}: pool.token_a = {}, pool.token_b = {}, input_token_mint = {}, direction_a_to_b = {}", 
            hop, 
            pool.token_a.to_string(), 
            pool.token_b.to_string(), 
            input_token_mint.to_string(), 
            direction_a_to_b
        ));
        
        let (reserve_in, reserve_out) = if direction_a_to_b {
            (pool.reserve_a, pool.reserve_b)
        } else {
            (pool.reserve_b, pool.reserve_a)
        };
        
        // Transfer input tokens to vault
        if direction_a_to_b {
            invoke(
                &create_transfer_instruction(
                    current_input_account.key,
                    vault_a_info.key,
                    user_info.key,
                    current_amount,
                ),
                &[
                    current_input_account.clone(),
                    vault_a_info.clone(),
                    user_info.clone(),
                    token_program_info.clone(),
                ],
            )?;
        } else {
            invoke(
                &create_transfer_instruction(
                    current_input_account.key,
                    vault_b_info.key,
                    user_info.key,
                    current_amount,
                ),
                &[
                    current_input_account.clone(),
                    vault_b_info.clone(),
                    user_info.clone(),
                    token_program_info.clone(),
                ],
            )?;
        }
        
        // Calculate output amount
        let amount_out = calculate_swap_output(current_amount, reserve_in, reserve_out)?;
        
        // Use final output account for last hop, intermediate for others
        let target_output_account = if hop == num_hops - 1 {
            output_account
        } else {
            intermediate_account
        };
        
        // Transfer output tokens using vault PDA as authority
        if direction_a_to_b {
            let vault_b_signer_seeds: &[&[_]] = &[
                b"vault",
                pool_info.key.as_ref(),
                pool.token_b.as_ref(),
                &[vault_b_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    vault_b_info.key,
                    target_output_account.key,
                    vault_b_info.key,
                    amount_out,
                ),
                &[
                    vault_b_info.clone(),
                    target_output_account.clone(),
                    vault_b_info.clone(),
                    token_program_info.clone(),
                ],
                &[vault_b_signer_seeds],
            )?;
        } else {
            let vault_a_signer_seeds: &[&[_]] = &[
                b"vault",
                pool_info.key.as_ref(),
                pool.token_a.as_ref(),
                &[vault_a_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    vault_a_info.key,
                    target_output_account.key,
                    vault_a_info.key,
                    amount_out,
                ),
                &[
                    vault_a_info.clone(),
                    target_output_account.clone(),
                    vault_a_info.clone(),
                    token_program_info.clone(),
                ],
                &[vault_a_signer_seeds],
            )?;
        }
        
        // Update pool reserves
        if direction_a_to_b {
            pool.reserve_a = pool.reserve_a.checked_add(current_amount).unwrap();
            pool.reserve_b = pool.reserve_b.checked_sub(amount_out).unwrap();
        } else {
            pool.reserve_b = pool.reserve_b.checked_add(current_amount).unwrap();
            pool.reserve_a = pool.reserve_a.checked_sub(amount_out).unwrap();
        }

        // Calculate and accumulate fees (0.3% of input amount)
        let fee_amount = (current_amount as u128 * 3 / 1000) as u64;
        if direction_a_to_b {
            // Fee collected in token A
            pool.fee_collected_a = pool.fee_collected_a.checked_add(fee_amount).unwrap();
        } else {
            // Fee collected in token B  
            pool.fee_collected_b = pool.fee_collected_b.checked_add(fee_amount).unwrap();
        }
        
        solana_program::log::sol_log(&format!("Multihop hop {} fee collected: {} (direction_a_to_b: {})", hop, fee_amount, direction_a_to_b));
        
        Pool::pack(pool, &mut pool_info.data.borrow_mut())?;
        
        // Set up for next hop
        current_amount = amount_out;
        current_input_account = target_output_account;
    }
    
    // Check minimum output requirement
    if current_amount < minimum_amount_out {
        return Err(ProgramError::InsufficientFunds);
    }
    
    Ok(())
}

fn process_multihop_swap_with_path(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount_in: u64,
    minimum_amount_out: u64,
    token_path: Vec<Pubkey>,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let user_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    
    // First account is user's input token account
    let user_input_account = next_account_info(account_info_iter)?;
    
    // Remaining accounts for pools, vaults, and intermediate accounts
    let mut remaining_accounts = Vec::new();
    while let Ok(account) = next_account_info(account_info_iter) {
        remaining_accounts.push(account);
    }
    
    if token_path.len() < 2 {
        return Err(ProgramError::InvalidArgument);
    }
    
    let num_hops = token_path.len() - 1;
    let mut current_amount = amount_in;
    let mut current_input_account = user_input_account;
    
    // Process each hop based on token path
    for hop in 0..num_hops {
        let base_idx = hop * 7; // Assuming 7 accounts per hop
        if base_idx + 6 >= remaining_accounts.len() {
            return Err(ProgramError::NotEnoughAccountKeys);
        }
        
        let pool_info = remaining_accounts[base_idx];
        let _token_a_info = remaining_accounts[base_idx + 1];
        let _token_b_info = remaining_accounts[base_idx + 2];
        let vault_a_info = remaining_accounts[base_idx + 3];
        let vault_b_info = remaining_accounts[base_idx + 4];
        let intermediate_account = remaining_accounts[base_idx + 5];
        let output_account = remaining_accounts[base_idx + 6];
        
        let mut pool = Pool::unpack(&pool_info.data.borrow())?;
        
        // Verify pool matches the token path
        let input_token = token_path[hop];
        let output_token = token_path[hop + 1];
        
        let direction_a_to_b = if pool.token_a == input_token && pool.token_b == output_token {
            true
        } else if pool.token_b == input_token && pool.token_a == output_token {
            false
        } else {
            return Err(ProgramError::InvalidArgument);
        };
        
        // Verify vault addresses
        let (vault_a_pubkey, vault_a_bump) = get_vault_address(pool_info.key, &pool.token_a, program_id);
        let (vault_b_pubkey, vault_b_bump) = get_vault_address(pool_info.key, &pool.token_b, program_id);
        
        if vault_a_pubkey != *vault_a_info.key || vault_b_pubkey != *vault_b_info.key {
            return Err(ProgramError::InvalidSeeds);
        }
        
        let (reserve_in, reserve_out, vault_in, _vault_out, _out_bump) = if direction_a_to_b {
            (pool.reserve_a, pool.reserve_b, vault_a_info, vault_b_info, vault_b_bump)
        } else {
            (pool.reserve_b, pool.reserve_a, vault_b_info, vault_a_info, vault_a_bump)
        };
        
        // Transfer input tokens to vault
        invoke(
            &create_transfer_instruction(
                current_input_account.key,
                vault_in.key,
                user_info.key,
                current_amount,
            ),
            &[
                current_input_account.clone(),
                vault_in.clone(),
                user_info.clone(),
                token_program_info.clone(),
            ],
        )?;
        
        // Calculate output amount
        let amount_out = calculate_swap_output(current_amount, reserve_in, reserve_out)?;
        
        // Use final output account for last hop, intermediate for others
        let target_output_account = if hop == num_hops - 1 {
            output_account
        } else {
            intermediate_account
        };
        
        // Transfer output tokens using vault PDA as authority
        if direction_a_to_b {
            let vault_b_signer_seeds: &[&[_]] = &[
                b"vault",
                pool_info.key.as_ref(),
                pool.token_b.as_ref(),
                &[vault_b_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    vault_b_info.key,
                    target_output_account.key,
                    vault_b_info.key,
                    amount_out,
                ),
                &[
                    vault_b_info.clone(),
                    target_output_account.clone(),
                    vault_b_info.clone(),
                    token_program_info.clone(),
                ],
                &[vault_b_signer_seeds],
            )?;
        } else {
            let vault_a_signer_seeds: &[&[_]] = &[
                b"vault",
                pool_info.key.as_ref(),
                pool.token_a.as_ref(),
                &[vault_a_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    vault_a_info.key,
                    target_output_account.key,
                    vault_a_info.key,
                    amount_out,
                ),
                &[
                    vault_a_info.clone(),
                    target_output_account.clone(),
                    vault_a_info.clone(),
                    token_program_info.clone(),
                ],
                &[vault_a_signer_seeds],
            )?;
        }
        
        // Update pool reserves
        if direction_a_to_b {
            pool.reserve_a = pool.reserve_a.checked_add(current_amount).unwrap();
            pool.reserve_b = pool.reserve_b.checked_sub(amount_out).unwrap();
        } else {
            pool.reserve_b = pool.reserve_b.checked_add(current_amount).unwrap();
            pool.reserve_a = pool.reserve_a.checked_sub(amount_out).unwrap();
        }

        // Calculate and accumulate fees (0.3% of input amount)
        let fee_amount = (current_amount as u128 * 3 / 1000) as u64;
        if direction_a_to_b {
            // Fee collected in token A
            pool.fee_collected_a = pool.fee_collected_a.checked_add(fee_amount).unwrap();
        } else {
            // Fee collected in token B  
            pool.fee_collected_b = pool.fee_collected_b.checked_add(fee_amount).unwrap();
        }
        
        solana_program::log::sol_log(&format!("Multihop hop {} fee collected: {} (direction_a_to_b: {})", hop, fee_amount, direction_a_to_b));
        
        Pool::pack(pool, &mut pool_info.data.borrow_mut())?;
        
        // Set up for next hop
        current_amount = amount_out;
        current_input_account = target_output_account;
    }
    
    // Ensure final output is above minimum
    if current_amount < minimum_amount_out {
        return Err(ProgramError::InsufficientFunds);
    }
    
    Ok(())
}

// Helper function to calculate output amount for a single swap
fn calculate_swap_output(
    amount_in: u64,
    reserve_in: u64,
    reserve_out: u64,
) -> Result<u64, ProgramError> {
    if amount_in == 0 || reserve_in == 0 || reserve_out == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    
    let amount_in_with_fee = (amount_in as u128).checked_mul(997).ok_or(ProgramError::InvalidArgument)?;
    let numerator = amount_in_with_fee.checked_mul(reserve_out as u128).ok_or(ProgramError::InvalidArgument)?;
    let denominator = (reserve_in as u128)
        .checked_mul(1000).ok_or(ProgramError::InvalidArgument)?
        .checked_add(amount_in_with_fee).ok_or(ProgramError::InvalidArgument)?;
    
    if denominator == 0 {
        return Err(ProgramError::InvalidArgument);
    }
    
    Ok((numerator / denominator) as u64)
}

// Helper function to calculate the expected output amount for a multihop swap
// Removed unused functions: calculate_multihop_output and determine_swap_direction

// Integer square root implementation for u128
trait IntegerSqrt {
    fn integer_sqrt(self) -> Self;
}

impl IntegerSqrt for u128 {
    fn integer_sqrt(self) -> Self {
        if self < 2 {
            return self;
        }
        let mut x = self;
        let mut y = (self + 1) / 2;
        while y < x {
            x = y;
            y = (x + self / x) / 2;
        }
        x
    }
}

// Fee collection functions
fn process_collect_fees(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool: Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let treasury_info = next_account_info(account_info_iter)?;
    let _authority_info = next_account_info(account_info_iter)?;
    
    // Verify pool account
    if pool_info.key != &pool {
        return Err(ProgramError::InvalidArgument);
    }
    
    // Try to deserialize as regular pool first
    let pool_data_result = Pool::unpack(&pool_info.data.borrow());
    if let Ok(pool_data) = pool_data_result {
        // Regular pool fee collection
        solana_program::log::sol_log("Collecting fees from regular pool");
        solana_program::log::sol_log(&format!("Fees collected A: {}", pool_data.fee_collected_a));
        solana_program::log::sol_log(&format!("Fees collected B: {}", pool_data.fee_collected_b));
        
        // Verify treasury is set
        if pool_data.fee_treasury != *treasury_info.key {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Reset collected fees (in production, you would transfer to treasury)
        let mut updated_pool_data = pool_data;
        updated_pool_data.fee_collected_a = 0;
        updated_pool_data.fee_collected_b = 0;
        
        // Pack updated pool state
        let mut pool_data_mut = pool_info.try_borrow_mut_data()?;
        updated_pool_data.pack_into_slice(&mut pool_data_mut[..Pool::LEN]);
        
        solana_program::log::sol_log("Fees collected successfully");
        
    } else {
        let pool_data_result = NativeSOLPool::unpack(&pool_info.data.borrow());
        if let Ok(pool_data) = pool_data_result {
        // Native SOL pool fee collection
        solana_program::log::sol_log("Collecting fees from native SOL pool");
        solana_program::log::sol_log(&format!("Fees collected SOL: {}", pool_data.fee_collected_sol));
        solana_program::log::sol_log(&format!("Fees collected Token: {}", pool_data.fee_collected_token));
        
        // Verify treasury is set
        if pool_data.fee_treasury != *treasury_info.key {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Reset collected fees (in production, you would transfer to treasury)
        let mut updated_pool_data = pool_data;
        updated_pool_data.fee_collected_sol = 0;
        updated_pool_data.fee_collected_token = 0;
        
        // Pack updated pool state
        let mut pool_data_mut = pool_info.try_borrow_mut_data()?;
        updated_pool_data.pack_into_slice(&mut pool_data_mut[..NativeSOLPool::LEN]);
        
        solana_program::log::sol_log("Fees collected successfully");
    } else {
        return Err(ProgramError::InvalidAccountData);
        }
    }
    
    Ok(())
}

fn process_withdraw_fees(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool: Pubkey,
    amount_a: u64,
    amount_b: u64,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let treasury_info = next_account_info(account_info_iter)?;
    let authority_info = next_account_info(account_info_iter)?;
    let token_program_info = next_account_info(account_info_iter)?;
    let system_program_info = next_account_info(account_info_iter)?;
    
    // Verify pool account
    if pool_info.key != &pool {
        return Err(ProgramError::InvalidArgument);
    }
    
    // Try to deserialize as regular pool first
    if let Ok(mut pool_data) = Pool::unpack(&pool_info.data.borrow()) {
        // Regular pool fee withdrawal
        solana_program::log::sol_log("Withdrawing fees from regular pool");
        solana_program::log::sol_log(&format!("Requested amount A: {}", amount_a));
        solana_program::log::sol_log(&format!("Requested amount B: {}", amount_b));
        solana_program::log::sol_log(&format!("Available fees A: {}", pool_data.fee_collected_a));
        solana_program::log::sol_log(&format!("Available fees B: {}", pool_data.fee_collected_b));
        
        // Verify treasury is set
        if pool_data.fee_treasury != *treasury_info.key {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Verify authority (treasury owner can withdraw)
        if authority_info.key != treasury_info.key {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Check if sufficient fees are available
        if amount_a > pool_data.fee_collected_a || amount_b > pool_data.fee_collected_b {
            return Err(ProgramError::InsufficientFunds);
        }
        
        // Get vault addresses for token transfers
        let (vault_a_pubkey, vault_a_bump) = get_vault_address(&pool, &pool_data.token_a, program_id);
        let (vault_b_pubkey, vault_b_bump) = get_vault_address(&pool, &pool_data.token_b, program_id);
        
        // Transfer Token A fees to treasury
        if amount_a > 0 {
            let vault_a_signer_seeds: &[&[_]] = &[
                b"vault",
                pool.as_ref(),
                pool_data.token_a.as_ref(),
                &[vault_a_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    &vault_a_pubkey,
                    treasury_info.key,
                    &vault_a_pubkey,
                    amount_a,
                ),
                &[
                    next_account_info(account_info_iter)?.clone(), // vault_a_info
                    treasury_info.clone(),
                    next_account_info(account_info_iter)?.clone(), // vault_a_info (authority)
                    token_program_info.clone(),
                ],
                &[vault_a_signer_seeds],
            )?;
        }
        
        // Transfer Token B fees to treasury
        if amount_b > 0 {
            let vault_b_signer_seeds: &[&[_]] = &[
                b"vault",
                pool.as_ref(),
                pool_data.token_b.as_ref(),
                &[vault_b_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    &vault_b_pubkey,
                    treasury_info.key,
                    &vault_b_pubkey,
                    amount_b,
                ),
                &[
                    next_account_info(account_info_iter)?.clone(), // vault_b_info
                    treasury_info.clone(),
                    next_account_info(account_info_iter)?.clone(), // vault_b_info (authority)
                    token_program_info.clone(),
                ],
                &[vault_b_signer_seeds],
            )?;
        }
        
        // Update pool state
        pool_data.fee_collected_a = pool_data.fee_collected_a.checked_sub(amount_a).unwrap();
        pool_data.fee_collected_b = pool_data.fee_collected_b.checked_sub(amount_b).unwrap();
        
        // Pack updated pool state
        let mut pool_data_mut = pool_info.try_borrow_mut_data()?;
        pool_data.pack_into_slice(&mut pool_data_mut[..Pool::LEN]);
        
        solana_program::log::sol_log("Fees withdrawn successfully");
        
    } else if let Ok(mut pool_data) = NativeSOLPool::unpack(&pool_info.data.borrow()) {
        // Native SOL pool fee withdrawal
        solana_program::log::sol_log("Withdrawing fees from native SOL pool");
        solana_program::log::sol_log(&format!("Requested amount SOL: {}", amount_a));
        solana_program::log::sol_log(&format!("Requested amount Token: {}", amount_b));
        solana_program::log::sol_log(&format!("Available fees SOL: {}", pool_data.fee_collected_sol));
        solana_program::log::sol_log(&format!("Available fees Token: {}", pool_data.fee_collected_token));
        
        // Verify treasury is set
        if pool_data.fee_treasury != *treasury_info.key {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Verify authority (treasury owner can withdraw)
        if authority_info.key != treasury_info.key {
            return Err(ProgramError::InvalidArgument);
        }
        
        // Check if sufficient fees are available
        if amount_a > pool_data.fee_collected_sol || amount_b > pool_data.fee_collected_token {
            return Err(ProgramError::InsufficientFunds);
        }
        
        // Transfer SOL fees to treasury
        if amount_a > 0 {
            invoke(
                &system_instruction::transfer(
                    pool_info.key,
                    treasury_info.key,
                    amount_a,
                ),
                &[
                    pool_info.clone(),
                    treasury_info.clone(),
                    system_program_info.clone(),
                ],
            )?;
        }
        
        // Transfer Token fees to treasury
        if amount_b > 0 {
            let (vault_pubkey, vault_bump) = Pubkey::find_program_address(
                &[b"native_sol_vault", pool.as_ref(), &pool_data.token_mint.as_ref()],
                program_id,
            );
            
            let vault_signer_seeds: &[&[_]] = &[
                b"native_sol_vault",
                pool.as_ref(),
                &pool_data.token_mint.as_ref(),
                &[vault_bump],
            ];
            
            invoke_signed(
                &create_transfer_instruction(
                    &vault_pubkey,
                    treasury_info.key,
                    &vault_pubkey,
                    amount_b,
                ),
                &[
                    next_account_info(account_info_iter)?.clone(), // vault_info
                    treasury_info.clone(),
                    next_account_info(account_info_iter)?.clone(), // vault_info (authority)
                    token_program_info.clone(),
                ],
                &[vault_signer_seeds],
            )?;
        }
        
        // Update pool state
        pool_data.fee_collected_sol = pool_data.fee_collected_sol.checked_sub(amount_a).unwrap();
        pool_data.fee_collected_token = pool_data.fee_collected_token.checked_sub(amount_b).unwrap();
        
        // Pack updated pool state
        let mut pool_data_mut = pool_info.try_borrow_mut_data()?;
        pool_data.pack_into_slice(&mut pool_data_mut[..NativeSOLPool::LEN]);
        
        solana_program::log::sol_log("Fees withdrawn successfully");
        
    } else {
        return Err(ProgramError::InvalidAccountData);
    }
    
    Ok(())
}

fn process_set_fee_treasury(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    pool: Pubkey,
    treasury: Pubkey,
) -> ProgramResult {
    let account_info_iter = &mut accounts.iter();
    let pool_info = next_account_info(account_info_iter)?;
    let treasury_info = next_account_info(account_info_iter)?;
    let _authority_info = next_account_info(account_info_iter)?;
    
    // Verify pool account
    if pool_info.key != &pool {
        return Err(ProgramError::InvalidArgument);
    }
    
    // Verify treasury account
    if treasury_info.key != &treasury {
        return Err(ProgramError::InvalidArgument);
    }
    
    // Try to deserialize as regular pool first
    let pool_data_result = Pool::unpack(&pool_info.data.borrow());
    if let Ok(pool_data) = pool_data_result {
        // Regular pool treasury setting
        solana_program::log::sol_log("Setting fee treasury for regular pool");
        solana_program::log::sol_log(&format!("New treasury: {}", treasury));
        
        let mut updated_pool_data = pool_data;
        updated_pool_data.fee_treasury = treasury;
        
        // Pack updated pool state
        let mut pool_data_mut = pool_info.try_borrow_mut_data()?;
        updated_pool_data.pack_into_slice(&mut pool_data_mut[..Pool::LEN]);
        
        solana_program::log::sol_log("Fee treasury set successfully");
        
        } else {
        let pool_data_result = NativeSOLPool::unpack(&pool_info.data.borrow());
        if let Ok(pool_data) = pool_data_result {
            // Native SOL pool treasury setting
            solana_program::log::sol_log("Setting fee treasury for native SOL pool");
            solana_program::log::sol_log(&format!("New treasury: {}", treasury));
            
            let mut updated_pool_data = pool_data;
            updated_pool_data.fee_treasury = treasury;
            
            // Pack updated pool state
            let mut pool_data_mut = pool_info.try_borrow_mut_data()?;
            updated_pool_data.pack_into_slice(&mut pool_data_mut[..NativeSOLPool::LEN]);
            
            solana_program::log::sol_log("Fee treasury set successfully");
        } else {
            return Err(ProgramError::InvalidAccountData);
        }
    }
    
    Ok(())
}