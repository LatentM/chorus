// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 11976940797198520133882530942108423853974379978793774163171080209891351791741;
    uint256 constant alphay  = 5124179413905891778351142056363006031328005244294055309363062874989747803754;
    uint256 constant betax1  = 18166724977763239847774239207243568126611497133266200569992349309145587224340;
    uint256 constant betax2  = 11979453023798373073390474085121313589632237212918949523922650439529586982320;
    uint256 constant betay1  = 9351066964291775528204927217962274216316741351195374084780859660524258741165;
    uint256 constant betay2  = 11128407635032926213087793375654169466032243902948912133669598169450480866403;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 18913973550230931970915997972445160020519480510338357034980815644698010873801;
    uint256 constant deltax2 = 12598696397784495788284316088071386855178955197631900897573860013137044129615;
    uint256 constant deltay1 = 2018522261400943312476265333910443588741684819129313001765466172128121325516;
    uint256 constant deltay2 = 5576008452206054996745521449884418296485682542702783992381899894212835041133;

    
    uint256 constant IC0x = 3605948308620838018108483465527543740719624832192144476420113993187730122907;
    uint256 constant IC0y = 6764672623709485177140043330807327208269565357673246354876770341078491354551;
    
    uint256 constant IC1x = 18392984809537250183343133201523077908124133687019013926543697676877752752203;
    uint256 constant IC1y = 3789021895550259165764093982500302600239956614853906771227441634037466709087;
    
    uint256 constant IC2x = 12884620711587551575279797891709768727782726280704415298489336344073745267958;
    uint256 constant IC2y = 3539522234452725602465348878278353959457827681763208060749086185827829534032;
    
    uint256 constant IC3x = 9047772480698593347996062979021755832179216460250765743198452540923150572764;
    uint256 constant IC3y = 3187957819258350608138826387587036979232350341024521743775855812091211600890;
    
    uint256 constant IC4x = 10925301288518323159133235675927096596947200194214148319957888440673291698907;
    uint256 constant IC4y = 146233260859372493638250182099210811363558971340935335909354956887132547842;
    
    uint256 constant IC5x = 7714618961198064845339404364310302932818253563993255591868395029091710354708;
    uint256 constant IC5y = 8496874451970490544403217349523097472516842546632397279198356610636171817485;
    
    uint256 constant IC6x = 18946476625504389767933841956091266098799897403132921668258478428217280410097;
    uint256 constant IC6y = 19462250278189855212564739789274947313332795551034544493576370474530913621214;
    
    uint256 constant IC7x = 8294680086875752896061685954483964053088357130183659471376905654424194504213;
    uint256 constant IC7y = 15776777168397742563656865531647393477870270606429855132909894801404883261895;
    
    uint256 constant IC8x = 19104699162058628466827554147131146317108245709075916275719425616713297468186;
    uint256 constant IC8y = 10980639913020223482936876077006497269651825989413404992287626789895618741645;
    
    uint256 constant IC9x = 15719069166728707141091542574727679371192711614220959056493094933997842278893;
    uint256 constant IC9y = 17204167198113614320452803001638420588054882294004993333149262772195160236432;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[9] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
