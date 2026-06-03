// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/StackBallGame.sol";
import "forge-std/StdJson.sol";
import "../lib/openzeppelin-contracts/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying StackBallGame...");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        StackBallGame implementation = new StackBallGame();
        console.log("Implementation deployed at:", address(implementation));

        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation), abi.encodeWithSelector(StackBallGame.initialize.selector, deployer)
        );
        console.log("Proxy deployed at:", address(proxy));

        vm.stopBroadcast();

        console.log("\n=== NEXT STEPS ===");
        console.log("1. Add to .env.local: NEXT_PUBLIC_CONTRACT_ADDRESS=", address(proxy));
        console.log("2. Deposit prize pool:");
        console.log(
            "   cast send",
            address(proxy),
            '"depositPrize()" --value 114ether --private-key $PRIVATE_KEY --rpc-url $CELO_TESTNET_RPC_URL'
        );
        console.log("3. Verify contract:");
        console.log(
            "   forge verify-contract",
            address(implementation),
            "src/StackBallGame.sol:StackBallGame --chain celo_testnet"
        );

        _saveDeploymentProxy(address(proxy), address(implementation));
    }

    function _saveDeploymentProxy(address proxy, address implementation) internal {
        string memory obj = "deployment";
        vm.serializeAddress(obj, "proxy", proxy);
        vm.serializeAddress(obj, "implementation", implementation);
        vm.serializeUint(obj, "chainId", block.chainid);
        string memory json = vm.serializeUint(obj, "deployedAt", block.timestamp);
        vm.writeFile("abi/deployment.json", json);
    }
}
