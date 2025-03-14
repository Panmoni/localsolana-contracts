Understanding the Dual Naming Convention

This is important to understand for all Anchor development:


    In Rust/IDL: Account names use snake_case (seller_token_account)

    In TypeScript for instruction parameters: Use snake_case exactly as in IDL

    In TypeScript for account properties: Use camelCase converted from snake_case in IDL


The confusion arises because Anchor does an automatic conversion when deserializing account data, but not when passing account parameters to instructions.
