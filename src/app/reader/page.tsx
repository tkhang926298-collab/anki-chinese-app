import { Metadata } from 'next'
import ReaderContent from './reader-content'

export const metadata: Metadata = {
    title: 'Reader & Mining | Anki Chinese',
    description: 'Đọc văn bản tiếng Trung, tra cứu nhanh và trích xuất từ vựng.',
}

export default function ReaderPage() {
    return <ReaderContent />
}
