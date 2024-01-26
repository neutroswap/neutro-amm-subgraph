import {Address, BigInt,} from "@graphprotocol/graph-ts"

// Initialize a Token Definition with the attributes
export class TokenDefinition {
  address : Address
  symbol: string
  name: string
  decimals: BigInt

  // Initialize a Token Definition with its attributes
  constructor(address: Address, symbol: string, name: string, decimals: BigInt) {
    this.address = address
    this.symbol = symbol
    this.name = name
    this.decimals = decimals
  }

  // Get all tokens with a static defintion
  static getStaticDefinitions(): Array<TokenDefinition> {
    let staticDefinitions = new Array<TokenDefinition>(2)

    // USDT (Multichain)
    let usdtMultichain = new TokenDefinition(
      Address.fromString('0xfa9343c3897324496a05fc75abed6bac29f8a40f'),
      'USDT (MULTICHAIN)',
      'DEPRECATED USDT',
      BigInt.fromI32(6)
    )
    staticDefinitions.push(usdtMultichain)

    // USDT (EOS)
    let usdtEos = new TokenDefinition(
      Address.fromString('0x33b57dc70014fd7aa6e1ed3080eed2b619632b8e'),
      'USDT',
      'USDT',
      BigInt.fromI32(6)
    )
    staticDefinitions.push(usdtEos)

    return staticDefinitions
  }

  // Helper for hardcoded tokens
  static fromAddress(tokenAddress: Address) : TokenDefinition | null {
    let staticDefinitions = this.getStaticDefinitions()
    let tokenAddressHex = tokenAddress.toHexString()

    // Search the definition using the address
    for (let i = 0; i < staticDefinitions.length; i++) {
      let staticDefinition = staticDefinitions[i]
      if(staticDefinition.address.toHexString() == tokenAddressHex) {
        return staticDefinition
      }
    }

    // If not found, return null
    return null
  }
}
