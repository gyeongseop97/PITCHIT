import type{Metadata}from"next";import"./globals.css";import"./brand.css";export const metadata:Metadata={title:"PITCHIT | Pitch it. Hit it.",description:"던지고, 읽고, 때려라. 싱글플레이와 실시간 1:1로 즐기는 3이닝 야구 심리전",icons:{icon:"/favicon.svg"}};export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}


