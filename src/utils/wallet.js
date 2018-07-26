import Config from 'react-native-config';
import EthereumJsWallet from 'ethereumjs-wallet';
import Web3 from 'web3';
import ProviderEngine from 'web3-provider-engine';
import WalletSubprovider from 'web3-provider-engine/subproviders/wallet';
import ProviderSubprovider from 'web3-provider-engine/subproviders/provider';
import { store } from '../config/store';
import {
  ADD_TOKEN,
  SET_WALLET_ADDRESS,
  SET_PRIVATE_KEY,
} from '../config/actionTypes';
import { erc20Abi } from './constants';

export default class WalletUtils {
  /**
   * Given an EthereumJSWallet instance, store both address and private key
   * in Redux store
   *
   * @param {Object} wallet
   */
  static storeWallet(wallet) {
    store.dispatch({
      type: SET_WALLET_ADDRESS,
      walletAddress: wallet.getAddressString(),
    });

    store.dispatch({
      type: SET_PRIVATE_KEY,
      privateKey: wallet.getPrivateKey().toString('hex'),
    });
  }

  /**
   * Generate an Ethereum wallet
   */
  static generateWallet() {
    let instance = EthereumJsWallet.generate(false);
    this.storeWallet(instance);
    return instance;
  }

  /**
   * Store a wallet in Redux store given a private key
   *
   * @param {String} privateKey
   */
  static restoreWallet(privateKey) {
    this.storeWallet(
      EthereumJsWallet.fromPrivateKey(Buffer.from(privateKey, 'hex')),
    );
  }

  /**
   * Reads an EthereumJSWallet instance from Redux store
   */
  static getWallet() {
    const { privateKey } = store.getState();

    return EthereumJsWallet.fromPrivateKey(Buffer.from(privateKey, 'hex'));
  }

  static getWeb3HTTPProvider() {
    switch (store.getState().network) {
      case 'ropsten':
        return new Web3.providers.HttpProvider(
          `https://ropsten.infura.io/v3/${Config.INFURA_API_KEY}`,
        );
      case 'kovan':
        return new Web3.providers.HttpProvider(
          `https://kovan.infura.io/v3/${Config.INFURA_API_KEY}`,
        );
      case 'rinkeby':
        return new Web3.providers.HttpProvider(
          `https://rinkeby.infura.io/v3/${Config.INFURA_API_KEY}`,
        );
      default:
        return new Web3.providers.HttpProvider(
          `https://mainnet.infura.io/v3/${Config.INFURA_API_KEY}`,
        );
    }
  }

  static getEtherscanApiSubdomain() {
    switch (store.getState().network) {
      case 'ropsten':
        return 'api-ropsten';
      case 'kovan':
        return 'api-kovan';
      case 'rinkeby':
        return 'api-rinkeby';
      default:
        return 'api';
    }
  }

  /**
   * Returns a web3 instance with the user's wallet
   */
  static getWeb3Instance() {
    const wallet = this.getWallet();

    const engine = new ProviderEngine();

    engine.addProvider(new WalletSubprovider(wallet, {}));
    engine.addProvider(new ProviderSubprovider(this.getWeb3HTTPProvider()));

    engine.start();

    const web3 = new Web3(engine);

    web3.eth.defaultAccount = wallet.getAddressString();

    return web3;
  }

  /**
   * Load the tokens the user owns
   */
  static loadTokensList() {
    const { availableTokens, network, walletAddress } = store.getState();

    if (network !== 'mainnet') return Promise.resolve();

    const availableTokensAddresses = availableTokens
      .filter(token => token.symbol !== 'ETH')
      .map(token => token.contractAddress);

    return fetch(
      `https://api.ethplorer.io/getAddressInfo/${walletAddress}?apiKey=freekey`,
    )
      .then(response => response.json())
      .then(data => {
        if (!data.tokens) {
          return Promise.resolve();
        }

        return data.tokens
          .filter(
            token =>
              !availableTokensAddresses.includes(token.tokenInfo.address),
          )
          .forEach(token => {
            store.dispatch({
              type: ADD_TOKEN,
              token: {
                contractAddress: token.tokenInfo.address,
                decimals: parseInt(token.tokenInfo.decimals, 10),
                name: token.tokenInfo.name,
                symbol: token.tokenInfo.symbol,
              },
            });
          });
      });
  }

  /**
   * Fetch a list of transactions for the user's wallet concerning the given token
   *
   * @param {Object} token
   */
  static getTransactions({ contractAddress, decimals, symbol }) {
    if (symbol === 'ETH') {
      return this.getEthTransactions();
    }

    return this.getERC20Transactions(contractAddress, decimals);
  }

  /**
   * Fetch a list of ETH transactions for the user's wallet
   */
  static getEthTransactions() {
    const { walletAddress } = store.getState();

    return fetch(
      `http://${this.getEtherscanApiSubdomain()}.etherscan.io/api?module=account&action=txlist&address=${walletAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${
        Config.ETHERSCAN_API_KEY
      }`,
    )
      .then(response => response.json())
      .then(data => {
        return data.result;
      });
  }

  /**
   * Fetch a list of a given token transactions for the user's wallet
   *
   * @param {String} contractAddress
   */
  static async getERC20Transactions(contractAddress, decimals) {
    const { walletAddress } = store.getState();
  }

  /**
   * Get the user's wallet balance of a given token
   *
   * @param {Object} token
   */
  static getBalance({ contractAddress, symbol, decimals }) {
    if (symbol === 'ETH') {
      return this.getEthBalance();
    }

    return this.getERC20Balance(contractAddress, decimals);
  }

  /**
   * Get the user's wallet ETH balance
   */
  static getEthBalance() {
    const { walletAddress } = store.getState();

    const web3 = new Web3(this.getWeb3HTTPProvider());

    return new Promise((resolve, reject) => {
      web3.eth.getBalance(walletAddress, (err, balance) => {
        if (!err) {
          resolve(balance.toNumber());
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Get the user's wallet balance of a specific ERC20 token
   *
   * @param {String} contractAddress
   * @param {Number} decimals
   */
  static getERC20Balance(contractAddress, decimals) {
    const { walletAddress } = store.getState();

    const web3 = new Web3(this.getWeb3HTTPProvider());
  }

  /**
   * Send a transaction from the user's wallet
   *
   * @param {Object} token
   * @param {String} toAddress
   * @param {String} amount
   */
  static sendTransaction(
    { contractAddress, symbol, decimals },
    toAddress,
    amount,
  ) {
    if (symbol === 'ETH') {
      return this.sendETHTransaction(toAddress, amount);
    }

    return this.sendERC20Transaction(
      contractAddress,
      decimals,
      toAddress,
      amount,
    );
  }

  /**
   * Send an ETH transaction to the given address with the given amount
   *
   * @param {String} toAddress
   * @param {String} amount
   */
  static sendETHTransaction(toAddress, amount) {
    const web3 = this.getWeb3Instance();

    return new Promise((resolve, reject) => {
      web3.eth.sendTransaction(
        {
          from: web3.eth.defaultAccount,
          to: toAddress,
          value: amount,
        },
        (err, transactionHash) => {
          if (!err) {
            resolve(transactionHash);
          } else {
            reject(err);
          }
        },
      );
    });
  }

  /**
   * Send an ETH transaction to the given address with the given amount
   *
   * @param {String} toAddress
   * @param {String} amount
   */
  static sendERC20Transaction(contractAddress, decimals, toAddress, amount) {
    const web3 = this.getWeb3Instance();
  }
}
