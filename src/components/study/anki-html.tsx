"use client"

import { useEffect, useRef } from "react"
import { db } from "@/lib/db/local"

interface AnkiHtmlProps {
    html: string
    className?: string
}

export function AnkiHtml({ html, className = "" }: AnkiHtmlProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;

        // 1. Replace Anki proprietary sound tags [sound:xyz.mp3] with minimal HTML5 audio tags (hidden)
        // We will inject custom Play buttons via JS below to avoid React hydration issues and Autoplay blocks.
        const formattedHtml = html.replace(/\[sound:(.+?)\]/g, '<audio class="anki-sound mx-auto my-2 hidden" src="$1"></audio>')
        container.innerHTML = formattedHtml;

        const objectUrls: string[] = [];

        const loadMedia = async () => {
            // Load Images
            const imgs = container.querySelectorAll('img');
            for (let i = 0; i < imgs.length; i++) {
                const img = imgs[i];

                // Default style to prevent broken layouts
                img.style.display = 'inline-block';
                img.style.verticalAlign = 'middle';
                img.style.maxWidth = '100%';
                img.style.maxHeight = '1.8em';

                // Hide broken image icons
                img.onerror = () => { img.style.display = 'none'; };

                const src = img.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                    const decodedSrc = decodeURIComponent(src);
                    const media = await db.media.get(decodedSrc) || await db.media.get(src);
                    if (media) {
                        let mimeType = 'image/jpeg';
                        if (decodedSrc.toLowerCase().endsWith('.png')) mimeType = 'image/png';
                        else if (decodedSrc.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
                        else if (decodedSrc.toLowerCase().endsWith('.svg')) mimeType = 'image/svg+xml';

                        let mediaBlob = media.data;
                        if (!mediaBlob.type) {
                            mediaBlob = new Blob([mediaBlob], { type: mimeType });
                        }

                        const url = URL.createObjectURL(mediaBlob);
                        objectUrls.push(url);
                        img.src = url;
                    }
                }
            }

            // Load Audios
            const audios = container.querySelectorAll<HTMLAudioElement>('audio.anki-sound');
            for (let i = 0; i < audios.length; i++) {
                const audio = audios[i];
                const src = audio.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                    const decodedSrc = decodeURIComponent(src);
                    const media = await db.media.get(decodedSrc) || await db.media.get(src);
                    if (media) {
                        let mimeType = 'audio/mpeg'; // default mp3
                        if (decodedSrc.toLowerCase().endsWith('.wav')) mimeType = 'audio/wav';
                        else if (decodedSrc.toLowerCase().endsWith('.ogg')) mimeType = 'audio/ogg';

                        let mediaBlob = media.data;
                        if (!mediaBlob.type) {
                            mediaBlob = new Blob([mediaBlob], { type: mimeType });
                        }

                        const url = URL.createObjectURL(mediaBlob);
                        objectUrls.push(url);
                        audio.src = url;
                        audio.load();

                        // Create a custom Play Button next to the hidden audio tag
                        if (!audio.nextElementSibling?.classList.contains('custom-audio-btn')) {
                            const btn = document.createElement('button');
                            btn.className = 'custom-audio-btn inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 mt-2 mx-auto flex gap-2';
                            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg> Phát âm thanh`;
                            btn.onclick = (e) => {
                                e.preventDefault();
                                audio.currentTime = 0;
                                audio.play().catch(err => console.error("Play error:", err));
                            };
                            audio.parentNode?.insertBefore(btn, audio.nextSibling);
                        }

                        // Optional: Try to auto-play once when loaded (might be blocked by browser)
                        const playPromise = audio.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(error => {
                                console.log("Audio autoplay prevented by browser policy (Require user interaction).");
                            });
                        }
                    }
                }
            }

            // Fallback: If no audio exists but there is text (like Chinese chars), inject Auto-TTS button
            if (audios.length === 0) {
                const textContent = container.innerText.trim()
                // Simple regex to check for Chinese characters
                const hasChinese = /[\u4e00-\u9fff]/.test(textContent)
                if (hasChinese && textContent.length > 0) {
                    const btn = document.createElement('button');
                    btn.className = 'custom-audio-btn inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border-emerald-500 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 h-10 px-4 py-2 mt-4 mx-auto flex gap-2 shadow-sm';
                    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bot"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg> Đọc phát âm (AI)`;
                    btn.onclick = (e) => {
                        e.preventDefault();
                        window.speechSynthesis.cancel(); // Stop playing previous
                        const utterance = new SpeechSynthesisUtterance(textContent);
                        utterance.lang = 'zh-CN';
                        // Adjust rate/pitch slightly for more natural sound
                        utterance.rate = 0.9;
                        window.speechSynthesis.speak(utterance);
                    };
                    container.appendChild(btn);
                }
            }
        };

        loadMedia();

        return () => {
            // Cleanup memory limits
            objectUrls.forEach(url => URL.revokeObjectURL(url));
        };
    }, [html])

    return <div ref={containerRef} className={className} />
}
