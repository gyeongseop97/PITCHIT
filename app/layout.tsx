import type{Metadata}from"next";import"./globals.css";import"./brand.css";
import { ClerkProvider } from "@clerk/nextjs";
const title="PITCHIT | 한 구에 담긴 읽고, 속이는 승부.";
const description="5×5 스트라이크존에서 작전을 고르고 상대의 심리를 읽어 승부하세요. 싱글 플레이와 실시간 1:1 야구 심리전 PITCHIT.";
export const metadata:Metadata={metadataBase:new URL("https://pitchit-baseball.vercel.app"),title,description,icons:{icon:"/favicon.svg"},openGraph:{type:"website",locale:"ko_KR",url:"/",siteName:"PITCHIT",title,description,images:[{url:"/pitchit-logo-v2.png",width:1254,height:1254,alt:"PITCHIT 로고"}]},twitter:{card:"summary_large_image",title,description,images:["/pitchit-logo-v2.png"]}};
export default function RootLayout({children}:{children:React.ReactNode}){
  // Keep the public game available if an integration is temporarily
  // disconnected. Clerk is restored automatically once its keys return.
  const content=process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?<ClerkProvider>{children}</ClerkProvider>:children;
  return <html lang="ko"><body>{content}</body></html>
}


