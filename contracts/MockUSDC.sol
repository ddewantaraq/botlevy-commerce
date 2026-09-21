// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC20} from "@openzeppelin/contracts@5.7.0/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts@5.7.0/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts@5.7.0/utils/Pausable.sol";

/**
 * MockUSDC — testnet-only ERC-20 (6 decimals).
 * Deploy on BNB Smart Chain Testnet (chainId 97) via Remix. Never mainnet.
 *
 * Deployer is owner. Only the owner can mint or burn. Pause stops transfers
 * (including mint/burn) without taking anyone's keys.
 * Cooker pay uses standard transfer — not mint/burn.
 */
contract MockUSDC is ERC20, Ownable, Pausable {
    constructor() ERC20("Mock USDC", "mUSDC") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner whenNotPaused {
        _mint(to, amount);
    }

    /// Owner cleanup / issuer-style destroy. Not used by the cooker pay path.
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _update(address from, address to, uint256 value)
        internal
        override
        whenNotPaused
    {
        super._update(from, to, value);
    }
}
