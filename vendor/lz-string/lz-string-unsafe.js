
var LZStringUnsafe = (
  function () {

    // private property
    var f = String.fromCharCode,
      Base64CharArray = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".split(''),
      UriSafeCharArray = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$".split(''),
      Base64ReverseDic = {},
      UriSafeReverseDic = {},
      i = 65;
    while (i--) {
      Base64ReverseDic[Base64CharArray[i].charCodeAt(0)] = i;
      UriSafeReverseDic[UriSafeCharArray[i].charCodeAt(0)] = i;
    }
    var getChar16Bits = function (a) { return f(a); },
      getCharFromBase64 = function (a) { return Base64CharArray[a]; },
      getCharFromURISafe = function (a) { return UriSafeCharArray[a]; },
      getCharFromUTF16 = function (a) { return f(a + 32); };

    var LZString = {
      compressToBase64: function (input) {
        if (input == null) return "";
        var res = LZString._compressToArray(input, 6, getCharFromBase64);
        // To produce valid Base64
        var i = res.length % 4;
        while (i--) {
          res.push("=");
        }

        return res.join('');
      },

      decompressFromBase64: function (input) {
        if (input == null) return "";
        if (input == "") return null;
        return LZString._decompress(input.length, 6, function (index) { return Base64ReverseDic[input.charCodeAt(index)]; });
      },

      compressToUTF16: function (input) {
        if (input == null) return "";
        var compressed = LZString._compressToArray(input, 15, getCharFromUTF16);
        compressed.push(" ");
        return compressed.join('');
      },

      decompressFromUTF16: function (compressed) {
        if (compressed == null) return "";
        if (compressed == "") return null;
        return LZString._decompress(compressed.length, 15, function (index) { return compressed.charCodeAt(index) - 32; });
      },

      //compress into uint8array (UCS-2 big endian format)
      compressToUint8Array: function (uncompressed) {
        var compressed = LZString.compressToArray(uncompressed);
        var buf = new Uint8Array(compressed.length * 2); // 2 bytes per character

        for (var i = 0, TotalLen = compressed.length; i < TotalLen; i++) {
          var current_value = compressed[i].charCodeAt(0);
          buf[i * 2] = current_value >>> 8;
          buf[i * 2 + 1] = current_value & 0xFF;
        }
        return buf;
      },

      //decompress from uint8array (UCS-2 big endian format)
      decompressFromUint8Array: function (compressed) {
        if (compressed === null || compressed === undefined) {
          return LZString.decompressFromArray(compressed);
        } else if (compressed.length == 0) {
          return null;
        }
        return LZString._decompress(compressed.length, 8, function (index) { return compressed[index]; });
      },


      //compress into a string that is already URI encoded
      compressToEncodedURIComponent: function (input) {
        if (input == null) return "";
        return LZString._compressToArray(input, 6, getCharFromURISafe).join('');
      },

      //decompress from an output of compressToEncodedURIComponent
      decompressFromEncodedURIComponent: function (input) {
        if (input == null) return "";
        if (input == "") return null;
        input = input.replace(/ /g, "+");
        return LZString._decompress(input.length, 6, function (index) { return UriSafeReverseDic[input.charCodeAt(index)]; });
      },

      compress: function (uncompressed) {
        return LZString.compressToArray(uncompressed).join('');
      },
      compressToArray: function (uncompressed) {
        return LZString._compressToArray(uncompressed, 16, getChar16Bits);
      },
      _compressToArray: function (uncompressed, bitsPerChar, getCharFromInt) {
        if (uncompressed == null) return [];
        var i = 0, j = 0, k = 0, value = 0,
          node = [3], // first node will always be initialised like this.
          // we should never output the root anyway,
          // so we initiate with terminating token
          // Also, dictionary[1] will be overwritten
          // by the firs charCode
          dictionary = [2, 2, node],
          freshNode = true,
          c = 0,
          nextNode,
          enlargeIn = 1,
          dictSize = 4,
          numBits = 2,
          data = [],
          data_val = 0,
          data_position = 0;

        if (uncompressed.length) {
          // If there is a string, the first charCode is guaranteed to
          // be new, so we write it to output stream, and add it to the
          // dictionary. For the same reason we can initialize freshNode
          // as true, and new_node, node and dictSize as if
          // it was already added to the dictionary (see above).

          c = uncompressed.charCodeAt(0);

          // == Write first charCode token to output ==

          // 8 or 16 bit?
          value = c < 256 ? 0 : 1

          // insert "new 8/16 bit charCode" token
          // into bitstream (value 1)
          for (i = 0; i < numBits; i++) {
            // Value is 0 (8 bit) or 1 (16 bit).
            // We shift it into the bitstream in reverse
            // (shifting has precedence over bitmasking)
            data_val = value >> i | data_val << 1;
            if (++data_position == bitsPerChar) {
              data_position = 0;
              data.push(getCharFromInt(data_val));
              data_val = 0;
            }
          }
          // insert charCode bits into bitstream
          // Nasty but effective hack:
          // loop 8 or 16 times based on token value
          value = 8 + 8 * value;
          for (i = 0; i < value; i++) {
            // shifting has precedence over bitmasking
            data_val = c >> i & 1 | data_val << 1;
            if (++data_position == bitsPerChar) {
              data_position = 0;
              data.push(getCharFromInt(data_val));
              data_val = 0;
            }
          }

          // Add charCode to the dictionary.
          dictionary[1] = c;

          nextchar:
          for (j = 1; j < uncompressed.length; j++) {
            c = uncompressed.charCodeAt(j);
            // does the new charCode match an existing prefix?
            for (k = 1; k < node.length; k += 2) {
              if (node[k] == c) {
                node = node[k + 1];
                continue nextchar;
              }
            }
            // we only end up here if there is no matching char

            // Prefix+charCode does not exist in trie yet.
            // We write the prefix to the bitstream, and add
            // the new charCode to the dictionary if it's new
            // Then we set `node` to the root node matching
            // the charCode.

            if (freshNode) {
              // Prefix is a freshly added character token,
              // which was already written to the bitstream
              freshNode = false;
            } else {
              // write out the current prefix token
              value = node[0];
              for (i = 0; i < numBits; i++) {
                // shifting has precedence over bitmasking
                data_val = value >> i & 1 | data_val << 1;
                if (++data_position == bitsPerChar) {
                  data_position = 0;
                  data.push(getCharFromInt(data_val));
                  data_val = 0;
                }
              }
            }

            // Is the new charCode a new character
            // that needs to be stored at the root?
            k = 1;
            while (dictionary[k] != c && k < dictionary.length) {
              k += 2;
            }
            if (k == dictionary.length) {
              // increase token bitlength if necessary
              if (--enlargeIn == 0) {
                enlargeIn = 1 << numBits++;
              }

              // insert "new 8/16 bit charCode" token,
              // see comments above for explanation
              value = c < 256 ? 0 : 1
              for (i = 0; i < numBits; i++) {
                data_val = value >> i | data_val << 1;
                if (++data_position == bitsPerChar) {
                  data_position = 0;
                  data.push(getCharFromInt(data_val));
                  data_val = 0;
                }
              }
              value = 8 + 8 * value;
              for (i = 0; i < value; i++) {
                data_val = c >> i & 1 | data_val << 1;
                if (++data_position == bitsPerChar) {
                  data_position = 0;
                  data.push(getCharFromInt(data_val));
                  data_val = 0;
                }
              }
              dictionary.push(c);
              dictionary.push([dictSize++]);
              // Note of that we already wrote
              // the charCode token to the bitstream
              freshNode = true;
            }
            // add node representing prefix + new charCode to trie
            node.push(c);
            node.push([dictSize++]);
            // increase token bitlength if necessary
            if (--enlargeIn == 0) {
              enlargeIn = 1 << numBits++;
            }
            // set node to first charCode of new prefix
            // k is guaranteed to be at the current charCode,
            // since we either broke out of the while loop
            // when it matched, or just added the new charCode
            node = dictionary[k + 1];

          }

          // === Write last prefix to output ===
          if (freshNode) {
            // character token already written to output
            freshNode = false;
          } else {
            // write out the prefix token
            value = node[0];
            for (i = 0; i < numBits; i++) {
              // shifting has precedence over bitmasking
              data_val = value >> i & 1 | data_val << 1;
              if (++data_position == bitsPerChar) {
                data_position = 0;
                data.push(getCharFromInt(data_val));
                data_val = 0;
              }
            }
          }

          // Is c a new character?
          k = 1;
          while (dictionary[k] != c && k < dictionary.length) {
            k += 2;
          }
          if (k == dictionary.length) {
            // increase token bitlength if necessary
            if (--enlargeIn == 0) {
              enlargeIn = 1 << numBits++;
            }
            // insert "new 8/16 bit charCode" token,
            // see comments above for explanation
            value = c < 256 ? 0 : 1
            for (i = 0; i < numBits; i++) {
              data_val = value >> i | data_val << 1;
              if (++data_position == bitsPerChar) {
                data_position = 0;
                data.push(getCharFromInt(data_val));
                data_val = 0;
              }
            }
            value = 8 + 8 * value;
            for (i = 0; i < value; i++) {
              data_val = c >> i & 1 | data_val << 1;
              if (++data_position == bitsPerChar) {
                data_position = 0;
                data.push(getCharFromInt(data_val));
                data_val = 0;
              }
            }
          }
          // increase token bitlength if necessary
          if (--enlargeIn == 0) {
            enlargeIn = 1 << numBits++;
          }
        }

        // Mark the end of the stream
        for (i = 0; i < numBits; i++) {
          // shifting has precedence over bitmasking
          data_val = 2 >> i & 1 | data_val << 1;
          if (++data_position == bitsPerChar) {
            data_position = 0;
            data.push(getCharFromInt(data_val));
            data_val = 0;
          }
        }

        // Flush the last char
        data_val <<= bitsPerChar - data_position;
        data.push(getCharFromInt(data_val));
        return data;
      },

      decompress: function (compressed) {
        if (compressed == null) return "";
        if (compressed == "") return null;
        return LZString._decompress(compressed.length, 16, function (index) { return compressed.charCodeAt(index); });
      },

      decompressFromArray: function (compressed) {
        if (compressed == null) return "";
        if (compressed.length == 0) return null;
        return LZString._decompress(compressed.length, 16, function (index) { return compressed[index].charCodeAt(0); });
      },

      _decompress: function (length, resetBits, getNextValue) {
        var dictionary = [0, 1, 2],
          enlargeIn = 4,
          dictSize = 4,
          numBits = 3,
          entry = "",
          result = [],
          w = "",
          bits = 0,
          maxpower = 2,
          power = 0,
          c = "",
          data_val = getNextValue(0),
          data_position = resetBits,
          data_index = 1;

        // Get first token, guaranteed to be either
        // a new character token (8 or 16 bits)
        // or end of stream token.
        while (power != maxpower) {
          // shifting has precedence over bitmasking
          bits += (data_val >> --data_position & 1) << power++;
          if (data_position == 0) {
            data_position = resetBits;
            data_val = getNextValue(data_index++);
          }
        }

        // if end of stream token, return empty string
        if (bits == 2) {
          return "";
        }

        // else, get character
        maxpower = bits * 8 + 8;
        bits = power = 0;
        while (power != maxpower) {
          // shifting has precedence over bitmasking
          bits += (data_val >> --data_position & 1) << power++;
          if (data_position == 0) {
            data_position = resetBits;
            data_val = getNextValue(data_index++);
          }
        }
        c = f(bits);
        dictionary[3] = c;
        w = c;
        result.push(c);

        // read rest of string
        while (data_index <= length) {
          // read out next token
          maxpower = numBits;
          bits = power = 0;
          while (power != maxpower) {
            // shifting has precedence over bitmasking
            bits += (data_val >> --data_position & 1) << power++;
            if (data_position == 0) {
              data_position = resetBits;
              data_val = getNextValue(data_index++);
            }
          }

          // 0 or 1 implies new character token
          if (bits < 2) {
            maxpower = (8 + 8 * bits);
            bits = power = 0;
            while (power != maxpower) {
              // shifting has precedence over bitmasking
              bits += (data_val >> --data_position & 1) << power++;
              if (data_position == 0) {
                data_position = resetBits;
                data_val = getNextValue(data_index++);
              }
            }
            dictionary[dictSize] = f(bits);
            bits = dictSize++;
            if (--enlargeIn == 0) {
              enlargeIn = 1 << numBits++;
            }
          } else if (bits == 2) {
            // end of stream token
            return result.join('');
          }

          if (bits > dictionary.length) {
            return null;
          }
          entry = bits < dictionary.length ? dictionary[bits] : w + w.charAt(0);
          result.push(entry);
          // Add w+entry[0] to the dictionary.
          dictionary[dictSize++] = w + entry.charAt(0);

          w = entry;

          if (--enlargeIn == 0) {
            enlargeIn = 1 << numBits++;
          }

        }
        return "";
      }
    };
    return LZString;
  }
)();

if (typeof define === 'function' && define.amd) {
  define(function () { return LZStringUnsafe; });
} else if (typeof module !== 'undefined' && module != null) {
  module.exports = LZStringUnsafe
} else if (typeof angular !== 'undefined' && angular != null) {
  angular.module('LZStringUnsafe', [])
    .factory('LZStringUnsafe', function () {
      return LZStringUnsafe;
    });
}
