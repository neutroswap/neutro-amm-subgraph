/* eslint-disable prefer-const */
import { Pair, Token, Bundle } from '../types/schema'
import { BigDecimal, Address, BigInt } from '@graphprotocol/graph-ts/index'
import { ZERO_BD, factoryContract, ADDRESS_ZERO, ONE_BD, UNTRACKED_PAIRS } from './helpers'

const WEOS_ADDRESS = '0xc00592aa41d32d137dc480d9f6d0df19b860104f'
const EOS_USDT_WEOS_PAIR = '0xc7df4c6e2343162a46c159932298a4b88fb85d96'
const MULTICHAIN_USDT_WEOS_PAIR = '0x90212ee7d342d280f519035e693168782215fa73'

export function getEosPriceInUSD(): BigDecimal {
  // fetch eos prices from new usdt(EOS) pair
  let eosUsdtPair = Pair.load(EOS_USDT_WEOS_PAIR) // usdt is token0

  if (eosUsdtPair !== null) {
    return eosUsdtPair.token0Price
  } else {
    // fetch eos prices from old usdt(multichain) pair
    // we trust this data until pool with new usdt(EOS) appears
    let multichainUsdtPair = Pair.load(MULTICHAIN_USDT_WEOS_PAIR)
    if (multichainUsdtPair != null) {
      return multichainUsdtPair.token1Price
    } else {
      return ZERO_BD
    }
  }
}


// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
  '0x33b57dc70014fd7aa6e1ed3080eed2b619632b8e', // USDT (EOS)
  '0xfa9343c3897324496a05fc75abed6bac29f8a40f', // USDT (MULTICHAIN)
  '0xc00592aa41d32d137dc480d9f6d0df19b860104f', // WEOS
  '0x765277eebeca2e31912c9946eae1021199b39c61', // USDC
]

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
let MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('100')

// minimum liquidity for price to get trackedc
let MINIMUM_LIQUIDITY_THRESHOLD_EOS = BigDecimal.fromString('0.1')

/**
 * Search through graph to find derived Eos per token.
 * @todo update to be derived EOS (add stablecoin estimates)
 **/
export function findEosPerToken(token: Token): BigDecimal {
  if (token.id == WEOS_ADDRESS) {
    return ONE_BD
  }

  let price = ZERO_BD
  let lastPairReserveEOS = MINIMUM_LIQUIDITY_THRESHOLD_EOS
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]))
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair.token0 == token.id && pair.reserveEOS.gt(lastPairReserveEOS)) {
        let token1 = Token.load(pair.token1)
        lastPairReserveEOS = pair.reserveEOS
        price = pair.token1Price.times(token1.derivedEOS as BigDecimal) // return token1 per our token * Eos per token 1
      }
      if (pair.token1 == token.id && pair.reserveEOS.gt(lastPairReserveEOS)) {
        let token0 = Token.load(pair.token0)
        lastPairReserveEOS = pair.reserveEOS
        price = pair.token0Price.times(token0.derivedEOS as BigDecimal) // return token0 per our token * EOS per token 0
      }
    }
  }
  return price // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedEOS.times(bundle.eosPrice)
  let price1 = token1.derivedEOS.times(bundle.eosPrice)

  // dont count tracked volume on these pairs - usually rebass tokens
  if (UNTRACKED_PAIRS.includes(pair.id)) {
    return ZERO_BD
  }

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0
      .times(price0)
      .plus(tokenAmount1.times(price1))
      .div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token
): BigDecimal {
  let bundle = Bundle.load('1')
  let price0 = token0.derivedEOS.times(bundle.eosPrice)
  let price1 = token1.derivedEOS.times(bundle.eosPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
