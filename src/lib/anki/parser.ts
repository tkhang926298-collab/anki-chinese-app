import initSqlJs, { Database } from 'sql.js'
import JSZip from 'jszip'
import { decompress } from 'fzstd'

export interface ParsedCard {
    front_html: string
    back_html: string
    fields: any  // string[] (raw) or Record<string, string> (named) or both via namedFields
    namedFields?: Record<string, string>  // fieldName -> value mapping (when available)
    tags?: string[]
}

export interface ParsedMedia {
    id: string
    data: Blob
}

export interface ParsedDeck {
    id: string
    name: string
    cards: ParsedCard[]
    media: ParsedMedia[]
}

function renderTemplate(template: string, fields: Record<string, string>, frontSide: string = '') {
    let result = template;
    result = result.replace(/{{FrontSide}}/gi, frontSide);
    result = result.replace(/{{#([^}]+)}}([\s\S]*?){{\/\1}}/g, (match, fieldName, content) => {
        return fields[fieldName] && fields[fieldName].trim() !== '' ? content : '';
    });
    result = result.replace(/{{\^([^}]+)}}([\s\S]*?){{\/\1}}/g, (match, fieldName, content) => {
        return !fields[fieldName] || fields[fieldName].trim() === '' ? content : '';
    });
    result = result.replace(/{{(?:[^:}]+:)?([^}]+)}}/g, (match, fieldName) => {
        const cleanFieldName = fieldName.split(':').pop() || fieldName;
        const val = fields[cleanFieldName];
        return val !== undefined ? val : '';
    });
    return result;
}

export async function parseApkgFile(file: File): Promise<ParsedDeck[]> {
    try {
        const arrayBuffer = await file.arrayBuffer()
        const zip = await JSZip.loadAsync(arrayBuffer)

        const SQL = await initSqlJs({
            locateFile: file => `/${file}`
        })

        const dbFileNames = ['collection.anki21b', 'collection.anki21', 'collection.anki2']
        let modelsTypes: any = {}
        const allNotesRows: any[] = []
        const allCardsRows: any[] = []
        let rawDecks: any = {}
        const decksMap: Record<string, ParsedDeck> = {}
        let foundAnyDb = false

        for (const dbName of dbFileNames) {
            const dbFile = zip.file(dbName)
            if (!dbFile) continue

            foundAnyDb = true
            const rawDbData = await dbFile.async('uint8array')
            let dbData = rawDbData

            if (rawDbData.length >= 4 && rawDbData[0] === 0x28 && rawDbData[1] === 0xB5 && rawDbData[2] === 0x2F && rawDbData[3] === 0xFD) {
                try {
                    dbData = decompress(rawDbData)
                } catch (e) {
                    console.error("Zstd decompression failed for database", dbName, e)
                    continue
                }
            }

            try {
                const db = new SQL.Database(dbData)

                // 1. Phân tích Subdecks list
                try {
                    // Cố gắng đọc bảng decks của Anki V3 trước tiên
                    const v3DecksResult = db.exec('SELECT id, name FROM decks')
                    if (v3DecksResult.length > 0 && v3DecksResult[0].values) {
                        for (const row of v3DecksResult[0].values) {
                            rawDecks[String(row[0])] = row[1] as string
                        }
                    }
                } catch (e) {
                    // Fallback to col.decks (JSON map) Anki V2
                    try {
                        const colDecksResult = db.exec(`SELECT decks FROM col`)
                        if (colDecksResult.length > 0 && colDecksResult[0].values && colDecksResult[0].values[0][0]) {
                            const parsedDecks = JSON.parse(colDecksResult[0].values[0][0] as string)
                            Object.entries(parsedDecks).forEach(([k, v]: [string, any]) => {
                                rawDecks[k] = v.name
                            })
                        }
                    } catch (e2) {
                        console.warn("Could not read decks from", dbName)
                    }
                }

                // 2. Parse Models (Lấy schema thẻ)
                let foundModelsInThisDb = false
                try {
                    const colResult = db.exec(`SELECT models FROM col`)
                    if (colResult.length > 0 && colResult[0].values && colResult[0].values[0][0]) {
                        const modelsJson = colResult[0].values[0][0] as string
                        if (modelsJson.trim().length > 0 && modelsJson.startsWith('{')) {
                            const parsedModels = JSON.parse(modelsJson)
                            if (Object.keys(parsedModels).length > 0) {
                                modelsTypes = { ...modelsTypes, ...parsedModels }
                                foundModelsInThisDb = true
                            }
                        }
                    }
                } catch (e) { }

                if (!foundModelsInThisDb) {
                    try {
                        const ntResult = db.exec('SELECT id, name FROM notetypes')
                        const fldsResult = db.exec('SELECT ntid, name, ord FROM fields ORDER BY ntid, ord')
                        const tmplResult = db.exec('SELECT ntid, name, config, ord FROM templates ORDER BY ntid, ord')

                        if (ntResult.length > 0 && ntResult[0].values.length > 0) {
                            for (const ntRow of ntResult[0].values) {
                                const ntId = String(ntRow[0])
                                const ntName = ntRow[1] as string

                                const flds = fldsResult.length > 0
                                    ? fldsResult[0].values
                                        .filter(f => String(f[0]) === ntId)
                                        .map(f => ({ name: f[1] as string, ord: f[2] as number }))
                                    : []

                                const tmpls = tmplResult.length > 0
                                    ? tmplResult[0].values
                                        .filter(t => String(t[0]) === ntId)
                                        .map(t => {
                                            const configBuf = t[2] as Uint8Array
                                            let qfmt = "", afmt = "";
                                            let offset = 0;
                                            while (offset < configBuf.length) {
                                                let tag = 0, shift = 0;
                                                while (true) {
                                                    let b = configBuf[offset++];
                                                    tag |= (b & 0x7F) << shift;
                                                    if (!(b & 0x80)) break;
                                                    shift += 7;
                                                }
                                                let wireType = tag & 0x07;
                                                let fieldNum = tag >> 3;

                                                if (wireType === 2) {
                                                    let len = 0; shift = 0;
                                                    while (true) {
                                                        let lb = configBuf[offset++];
                                                        len |= (lb & 0x7F) << shift;
                                                        if (!(lb & 0x80)) break;
                                                        shift += 7;
                                                    }
                                                    let valBuf = configBuf.slice(offset, offset + len);
                                                    offset += len;
                                                    let valStr = new TextDecoder('utf-8').decode(valBuf);
                                                    if (fieldNum === 1) qfmt = valStr;
                                                    else if (fieldNum === 2) afmt = valStr;
                                                } else if (wireType === 0) {
                                                    while ((configBuf[offset++] & 0x80) !== 0) { }
                                                } else if (wireType === 1) {
                                                    offset += 8;
                                                } else if (wireType === 5) {
                                                    offset += 4;
                                                } else {
                                                    break;
                                                }
                                            }
                                            return { name: t[1] as string, qfmt, afmt, ord: t[3] as number }
                                        })
                                    : []

                                modelsTypes[ntId] = { name: ntName, flds, tmpls }
                            }
                            foundModelsInThisDb = true
                        }
                    } catch (e) { }
                }

                // 3. Đọc dữ liệu thẻ (Thực thể Cards.did giúp map Card -> Deck)
                try {
                    // Join table Cards và Notes để quy đổi Front Back tương ứng với Deck ID (did)
                    const result = db.exec(`
                        SELECT c.did, n.flds, n.tags, n.mid 
                        FROM cards c 
                        JOIN notes n ON c.nid = n.id
                    `)
                    if (result.length > 0 && result[0].values) {
                        allCardsRows.push(...result[0].values)
                    }
                } catch (e) {
                    console.warn(`Lỗi khi đọc bảng cards kết hợp notes ${dbName}`)
                }

                db.close()
            } catch (err) {
                console.error("Error reading database", dbName, err)
            }
        }

        if (!foundAnyDb) throw new Error('Could not find any Anki database in the package.')
        if (Object.keys(modelsTypes).length === 0) throw new Error('Models not found in Anki deck.')
        if (allCardsRows.length === 0) throw new Error('No cards found in the Anki deck.')

        // Map cấu trúc Decks Output
        const seenFldsPerDeck = new Set<string>()

        // Nếu dữ liệu bị mất thông tin Tên Decks, dùng tên Root File làm mặc định
        if (Object.keys(rawDecks).length === 0) {
            rawDecks['default'] = file.name.replace(/\.[^/.]+$/, '')
        }

        for (const row of allCardsRows) {
            const did = String(row[0]) || 'default'
            const fldsStr = row[1] as string
            const tagsStr = row[2] ? (row[2] as string).trim() : ''
            const mid = String(row[3])

            // Xóa thẻ trùng lặp nội dung front/back trong CÙNG MỘT DECK
            const dedupKey = `${did}-${fldsStr}`
            if (seenFldsPerDeck.has(dedupKey)) continue
            seenFldsPerDeck.add(dedupKey)

            const fields = fldsStr.split('\x1f')
            const model = modelsTypes[mid]

            if (!model) continue;

            const fieldMap: Record<string, string> = {}
            if (model.flds) {
                model.flds.forEach((f: any) => {
                    fieldMap[f.name] = fields[f.ord] || ''
                })
            }

            if (model.tmpls) {
                for (const tmpl of model.tmpls) {
                    const front_html = renderTemplate(tmpl.qfmt || '', fieldMap)
                    const back_html = renderTemplate(tmpl.afmt || '', fieldMap, front_html)

                    const hasData = Object.values(fieldMap).some(v => v.trim() !== '')

                    if (hasData) {
                        const tagsArr = tagsStr ? tagsStr.split(' ').filter(Boolean) : []
                        let targetDid = did
                        let targetDeckName = rawDecks[did] || (file.name.replace(/\.[^/.]+$/, '') + ` (Deck ${did})`)

                        // Kích hoạt Virtual Subdeck bằng Tags nếu file gốc chỉ có <= 1 Deck (Không chia sẵn cấu trúc)
                        if (Object.keys(rawDecks).length <= 1 && tagsArr.length > 0) {
                            targetDid = `tag_${tagsArr[0]}`
                            const rootDeckName = rawDecks['default'] || file.name.replace(/\.[^/.]+$/, '')
                            targetDeckName = `${rootDeckName} 〉 ${tagsArr[0]}`
                        }

                        if (!decksMap[targetDid]) {
                            decksMap[targetDid] = {
                                id: targetDid,
                                name: targetDeckName,
                                cards: [],
                                media: []
                            }
                        }

                        decksMap[targetDid].cards.push({
                            front_html: front_html.trim() !== '' ? front_html : 'Thẻ trống',
                            back_html,
                            fields,
                            namedFields: Object.keys(fieldMap).length > 0 ? fieldMap : undefined,
                            tags: tagsArr
                        })
                    }
                }
            }
        }

        // 4. Bóc tách file Media
        const mediaFiles: ParsedMedia[] = []
        const mediaFileObj = zip.file('media')
        if (mediaFileObj) {
            try {
                let mediaBuffer = await mediaFileObj.async('uint8array')

                if (mediaBuffer.length >= 4 && mediaBuffer[0] === 0x28 && mediaBuffer[1] === 0xB5 && mediaBuffer[2] === 0x2F && mediaBuffer[3] === 0xFD) {
                    mediaBuffer = decompress(mediaBuffer)
                }

                let mediaMap: Record<string, string> = {}

                try {
                    const mediaStr = new TextDecoder('utf-8').decode(mediaBuffer)
                    mediaMap = JSON.parse(mediaStr)
                } catch (jsonErr) {
                    const resMapping: Record<string, string> = {};
                    let offset = 0;
                    while (offset < mediaBuffer.length) {
                        let tag = 0, shift = 0;
                        while (true) {
                            let b = mediaBuffer[offset++];
                            tag |= (b & 0x7F) << shift;
                            if (!(b & 0x80)) break;
                            shift += 7;
                        }

                        let wireType = tag & 0x07;
                        let fieldNum = tag >> 3;

                        if (wireType === 2) {
                            let len = 0; shift = 0;
                            while (true) {
                                let b = mediaBuffer[offset++];
                                len |= (b & 0x7F) << shift;
                                if (!(b & 0x80)) break;
                                shift += 7;
                            }

                            let valBuf = mediaBuffer.slice(offset, offset + len);
                            offset += len;

                            if (fieldNum === 1) {
                                let innerOffset = 0;
                                let k = "", v = "";
                                while (innerOffset < valBuf.length) {
                                    let innerTag = 0, innerShift = 0;
                                    while (true) {
                                        let b = valBuf[innerOffset++];
                                        innerTag |= (b & 0x7F) << innerShift;
                                        if (!(b & 0x80)) break;
                                        innerShift += 7;
                                    }
                                    let innerWt = innerTag & 0x07;
                                    let innerFn = innerTag >> 3;

                                    if (innerWt === 2) {
                                        let iLen = 0; innerShift = 0;
                                        while (true) {
                                            let b = valBuf[innerOffset++];
                                            iLen |= (b & 0x7F) << innerShift;
                                            if (!(b & 0x80)) break;
                                            innerShift += 7;
                                        }
                                        let iVal = new TextDecoder('utf-8').decode(valBuf.slice(innerOffset, innerOffset + iLen));
                                        innerOffset += iLen;

                                        if (innerFn === 1) k = iVal;
                                        else if (innerFn === 2) v = iVal;
                                    } else if (innerWt === 0) {
                                        let iVal = 0; innerShift = 0;
                                        while (true) {
                                            let b = valBuf[innerOffset++];
                                            iVal |= (b & 0x7F) << innerShift;
                                            if (!(b & 0x80)) break;
                                            innerShift += 7;
                                        }
                                        if (innerFn === 1) k = String(iVal);
                                        else if (innerFn === 2) v = String(iVal);
                                    }
                                }
                                if (v) {
                                    resMapping[v] = k;
                                }
                            }
                        } else {
                            break;
                        }
                    }
                    mediaMap = resMapping;
                }

                for (const [key, filename] of Object.entries(mediaMap)) {
                    const fileInZip = zip.file(key)
                    if (fileInZip) {
                        const blob = await fileInZip.async('blob')
                        mediaFiles.push({
                            id: filename,
                            data: blob
                        })
                    }
                }
            } catch (mediaError) {
                console.warn('Media file could not be parsed.', mediaError)
            }
        }

        // Tối giản cây Media bằng cách nhồi chung Media vào Subdeck đầu tiên, 
        // vì Media vốn chia sẻ chung cho toàn Database. IndexedDB sẽ cache theo ID Filename.
        const outputDecks = Object.values(decksMap).filter(d => d.cards.length > 0)
        if (outputDecks.length > 0) {
            outputDecks[0].media = mediaFiles
        }

        return outputDecks

    } catch (error: any) {
        console.error('Error parsing .apkg file:', error)
        throw new Error(error.message || 'Unknown parsing error')
    }
}
