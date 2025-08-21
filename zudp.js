/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
    "use strict";
    var os = require('os');
    var dgram = require('dgram');
    var events = require("events");
    var _zemitter = new events.EventEmitter();

    var zudpInputPortsInUse = {};
    var zudpInputPortsNodes = {};
    // The Input Node
    function ZUDPin(n) {
        RED.nodes.createNode(this, n);
        this.group = n.group;
        this.port = n.port;
        this.datatype = n.datatype;
        this.iface = n.iface || null;
        this.multicast = n.multicast;
        this.ipv = n.ipv || "udp4";
        var node = this;

        if (node.iface && node.iface.indexOf(".") === -1) {
            try {
                if ((os.networkInterfaces())[node.iface][0].hasOwnProperty("scopeid")) {
                    if (node.ipv === "udp4") {
                        node.iface = (os.networkInterfaces())[node.iface][1].address;
                    } else {
                        node.iface = (os.networkInterfaces())[node.iface][0].address;
                    }
                }
                else {
                    if (node.ipv === "udp4") {
                        node.iface = (os.networkInterfaces())[node.iface][0].address;
                    } else {
                        node.iface = (os.networkInterfaces())[node.iface][1].address;
                    }
                }
            }
            catch (e) {
                node.warn(RED._("zudp.errors.ifnotfound", { iface: node.iface }));
                node.iface = null;
            }
        }

        var opts = { type: node.ipv, reuseAddr: true };
        if (process.version.indexOf("v0.10") === 0) { opts = node.ipv; }

        function createServer() {
            var server;
            // node.warn(`Creating server...${node.port}`);
            // node.warn(zudpInputPortsInUse);
            if (!zudpInputPortsInUse.hasOwnProperty(node.port)) {
                server = dgram.createSocket(opts);  // default to udp4
                server.bind(node.port, function () {
                    if (node.multicast == "true") {
                        server.setBroadcast(true);
                        server.setMulticastLoopback(false);
                        try {
                            server.setMulticastTTL(128);
                            server.addMembership(node.group, node.iface);
                            if (node.iface) { node.status({ text: n.iface + " : " + node.iface }); }
                            node.log(RED._("zudp.status.mc-group", { group: node.group }));
                        } catch (e) {
                            if (e.errno == "EINVAL") {
                                node.error(RED._("zudp.errors.bad-mcaddress"));
                            } else if (e.errno == "ENODEV") {
                                node.error(RED._("zudp.errors.interface"));
                            } else {
                                node.error(RED._("zudp.errors.error", { error: e.errno }));
                            }
                        }
                    }
                });
                zudpInputPortsInUse[node.port] = server;
                zudpInputPortsNodes[node.port] = node;
                _zemitter.emit('reInitUDPOnIn', node.port);
            }
            else {
                node.log(RED._("zudp.errors.alreadyused", { port: node.port }));
                server = zudpInputPortsInUse[node.port];  // re-use existing
                if (node.iface) { node.status({ text: n.iface + " : " + node.iface }); }
            }

            server.on("error", function (err) {
                if ((err.code == "EACCES") && (node.port < 1024)) {
                    node.error(RED._("zudp.errors.access-error"));
                } else {
                    node.error(RED._("zudp.errors.error", { error: err.code }));
                }
                server.close();
            });

            server.on('message', function (message, remote) {
                var msg;
                if (node.datatype == "base64") {
                    msg = { payload: message.toString('base64'), fromip: remote.address + ':' + remote.port, ip: remote.address, port: remote.port };
                } else if (node.datatype == "utf8") {
                    msg = { payload: message.toString('utf8'), fromip: remote.address + ':' + remote.port, ip: remote.address, port: remote.port };
                } else {
                    msg = { payload: message, fromip: remote.address + ':' + remote.port, ip: remote.address, port: remote.port };
                }
                node.send(msg);
            });

            server.on('listening', function () {
                var address = server.address();
                node.log(RED._("zudp.status.listener-at", { host: node.iface || address.address, port: address.port }));

            });
        }

        createServer();

        function reInitUDP(port, portOther) {
            try {
                if (port == node.port) {
                    // node.warn({ port: port, msg: "UDP连接已经关闭并重建" });
                    createServer()
                } else if (portOther && portOther.length > 0) {
                    for (let pi = 0; pi < portOther.length; pi++) {
                        const portI = portOther[pi];
                        if (portI == node.port) {
                            createServer();
                            break;
                        }
                    }
                }
            } catch (error) {
                node.error(error);
            }

        }
        _zemitter.on("reInitUDPInputPort", reInitUDP)
        // node.on("input", function (msg, nodeSend, nodeDone) {
        // })
        function closeServer() {
            if (node.multicast == "true") { server.dropMembership(node.group); }
            server.close();
            node.log(RED._("zudp.status.listener-stopped"));
        }
        node.on("close", function () {
            try {
                _zemitter.removeListener("reInitUDPInputPort", reInitUDP);
                closeServer();
            } catch (err) {
                //node.error(err);
            }
            if (zudpInputPortsInUse.hasOwnProperty(node.port)) {
                delete zudpInputPortsInUse[node.port];
            }
            node.status({});
        });

    }
    RED.httpAdmin.get('/zudp-ports/:id', RED.auth.needsPermission('zudp-ports.read'), function (req, res) {
        res.json(Object.keys(zudpInputPortsInUse));
    });
    RED.nodes.registerType("zudp in", ZUDPin);



    // The Output Node
    function ZUDPout(n) {
        RED.nodes.createNode(this, n);
        //this.group = n.group;
        this.port = n.port;
        this.outport = n.outport || "";
        this.base64 = n.base64;
        this.addr = n.addr;
        this.iface = n.iface || null;
        this.multicast = n.multicast;
        this.ipv = n.ipv || "udp4";
        var node = this;

        if (node.iface && node.iface.indexOf(".") === -1) {
            try {
                if ((os.networkInterfaces())[node.iface][0].hasOwnProperty("scopeid")) {
                    if (node.ipv === "udp4") {
                        node.iface = (os.networkInterfaces())[node.iface][1].address;
                    } else {
                        node.iface = (os.networkInterfaces())[node.iface][0].address;
                    }
                }
                else {
                    if (node.ipv === "udp4") {
                        node.iface = (os.networkInterfaces())[node.iface][0].address;
                    } else {
                        node.iface = (os.networkInterfaces())[node.iface][1].address;
                    }
                }
            }
            catch (e) {
                node.warn(RED._("zudp.errors.ifnotfound", { iface: node.iface }));
                node.iface = null;
            }
        }

        var opts = { type: node.ipv, reuseAddr: true };

        var sock;
        var _p = this.outport || this.port || "0";


        function getSocket(port) {
            if ((port != 0) && zudpInputPortsInUse[port]) {
                sock = zudpInputPortsInUse[port];
                if (node.multicast != "false") {
                    sock.setBroadcast(true);
                    sock.setMulticastLoopback(false);
                }
                node.log(RED._("zudp.status.re-use", { outport: node.outport, host: node.addr, port: node.port }));
                if (node.iface) { node.status({ text: n.iface + " : " + node.iface }); }
            }
            else {
                sock = dgram.createSocket(opts);  // default to udp4
                if (node.multicast != "false") {
                    sock.bind(node.outport, function () {    // have to bind before you can enable broadcast...
                        sock.setBroadcast(true);            // turn on broadcast
                        sock.setMulticastLoopback(false);   // turn off loopback
                        if (node.multicast == "multi") {
                            try {
                                sock.setMulticastTTL(128);
                                sock.addMembership(node.addr, node.iface);   // Add to the multicast group
                                if (node.iface) { node.status({ text: n.iface + " : " + node.iface }); }
                                node.log(RED._("zudp.status.mc-ready", { iface: node.iface, outport: node.outport, host: node.addr, port: node.port }));
                            } catch (e) {
                                if (e.errno == "EINVAL") {
                                    node.error(RED._("zudp.errors.bad-mcaddress"));
                                } else if (e.errno == "ENODEV") {
                                    node.error(RED._("zudp.errors.interface"));
                                } else {
                                    node.error(RED._("zudp.errors.error", { error: e.errno }));
                                }
                            }
                        } else {
                            node.log(RED._("zudp.status.bc-ready", { outport: node.outport, host: node.addr, port: node.port }));
                        }
                    });
                } else if ((node.outport !== "") && (!zudpInputPortsInUse[node.outport])) {
                    sock.bind(node.outport);
                    node.log(RED._("zudp.status.ready", { outport: node.outport, host: node.addr, port: node.port }));
                } else {
                    node.log(RED._("zudp.status.ready-nolocal", { host: node.addr, port: node.port }));
                }
                sock.on("error", function (err) {
                    // Any async error will also get reported in the sock.send call.
                    // This handler is needed to ensure the error marked as handled to
                    // prevent it going to the global error handler and shutting node-red
                    // down.
                });
                zudpInputPortsInUse[port] = sock;
                zudpInputPortsNodes[port] = node;
            }
        }

        node.tout = setTimeout(function () {
            getSocket(_p);

            node.on("input", function (msg, nodeSend, nodeDone) {
                if (!zudpInputPortsInUse[_p]) {
                    _zemitter.emit('reInitUDPInputPort', _p, msg.portOther || []);
                    getSocket(_p);
                }
                if (msg.hasOwnProperty("payload")) {
                    var add = node.addr || msg.ip || "";
                    var por = node.port || msg.port || 0;
                    if (add === "") {
                        node.warn(RED._("zudp.errors.ip-notset"));
                        nodeDone();
                    } else if (por === 0) {
                        node.warn(RED._("zudp.errors.port-notset"));
                        nodeDone();
                    } else if (isNaN(por) || (por < 1) || (por > 65535)) {
                        node.warn(RED._("zudp.errors.port-invalid"));
                        nodeDone();
                    } else {
                        var message;
                        if (node.base64) {
                            message = Buffer.from(msg.payload, 'base64');
                        } else if (msg.payload instanceof Buffer) {
                            message = msg.payload;
                        } else {
                            message = Buffer.from("" + msg.payload);
                        }
                        msg._message = message
                        sock.send(message, 0, message.length, por, add, function (err, bytes) {
                            if (err) {
                                node.error("udp : " + err, msg);
                                msg.error = err;
                            }
                            nodeSend(msg);
                            message = null;
                            nodeDone();
                        });
                    }
                }
            });
        }, 75);

        node.on("close", function () {
            if (node.tout) { clearTimeout(node.tout); }
            try {
                if (node.multicast == "multi") { sock.dropMembership(node.group); }
                sock.close();
                node.log(RED._("zudp.status.output-stopped"));
            } catch (err) {
                //node.error(err);
            }
            if (zudpInputPortsInUse.hasOwnProperty(p)) {
                delete zudpInputPortsInUse[p];
            }
            node.status({});
        });
    }
    RED.nodes.registerType("zudp out", ZUDPout);


    // The close Node
    function ZUDPclose(n) {
        RED.nodes.createNode(this, n);
        var node = this;

        function onMsg(msg, send, done) {
            var port = msg.port;
            msg.payload = port;
            // 如果指定了特定端口，则只关闭该端口
            if (port && zudpInputPortsInUse.hasOwnProperty(port)) {
                close(port);
                node.status({ fill: "green", shape: "dot", text: "当前UDP连接数" + Object.keys(zudpInputPortsInUse).length });
            }
            // 如果没有指定端口，则关闭所有UDP连接
            else if (!port) {
                closeAll();
            }
            send(msg);
            done();
        }

        node.on("input", function (msg, send, done) {
            onMsg(msg, send, done)
        });

        function close(port) {
            try {
                let zudpInputNode = zudpInputPortsNodes[port];
                let sock = zudpInputPortsInUse[port]

                if (zudpInputNode.tout) { clearTimeout(zudpInputNode.tout); }
                if (zudpInputNode.multicast == "multi") {
                    sock.dropMembership(zudpInputNode.group);
                }
                delete zudpInputPortsNodes[port];

                sock.close();
                delete zudpInputPortsInUse[port];
                node.log(`port: ${port} closed`);
            } catch (err) {
                node.warn({ port: port, msg: err });
            }
        }
        function closeAll() {
            Object.keys(zudpInputPortsInUse).forEach(function (port) {
                try {
                    close(port);
                } catch (err) {
                    node.warn({ port: port, msg: err });
                }
            });
            node.status({ fill: "green", shape: "dot", text: "所有连接已经关闭" });
        }

        function reInitUDPonClose(port) {
            // node.warn({ port: port, msg: "UDP连接已经关闭" });
            node.status({ fill: "green", shape: "dot", text: "当前UDP连接数" + Object.keys(zudpInputPortsInUse).length });
        }
        function reInitUDPOnIn(port) {
            // node.warn({ port: port, msg: "UDP连接已经关闭" });
            node.status({ fill: "green", shape: "dot", text: "当前UDP连接数" + Object.keys(zudpInputPortsInUse).length });
        }
        _zemitter.on("reInitUDPInputPort", reInitUDPonClose)
        _zemitter.on("reInitUDPOnIn", reInitUDPOnIn)
        // 当节点关闭时，清除所有UDP连接
        node.on("close", function () {
            _zemitter.removeListener("reInitUDPInputPort", reInitUDPonClose);
            _zemitter.removeListener("reInitUDPOnIn", reInitUDPOnIn);
        });
    }

    RED.nodes.registerType("zudp close", ZUDPclose);

}
