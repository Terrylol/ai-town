import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
import starImg from '../assets/star.svg';
import helpImg from '../assets/help.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState } from 'react';
import ReactModal from 'react-modal';
import MusicButton from './components/buttons/MusicButton.tsx';
import Button from './components/buttons/Button.tsx';
import InteractButton from './components/buttons/InteractButton.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import { MAX_HUMAN_PLAYERS } from '../convex/constants.ts';

export default function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between font-body game-background">
      <ReactModal
        isOpen={helpModalOpen}
        onRequestClose={() => setHelpModalOpen(false)}
        style={modalStyles}
        contentLabel="帮助弹窗"
        ariaHideApp={false}
      >
        <div className="font-body">
          <h1 className="text-center text-6xl font-bold font-display game-title">帮助</h1>
          <p>
            欢迎来到 AI Town。你可以作为游客旁观小镇，也可以加入模拟，和镇上的角色互动。
          </p>
          <h2 className="text-4xl mt-4">旁观</h2>
          <p>
            按住并拖拽可以移动视角，滚轮可以缩放地图。点击任意角色，可以查看他们的资料和聊天记录。
          </p>
          <h2 className="text-4xl mt-4">互动</h2>
          <p>
            点击“Interact”后，你的角色会出现在地图上，脚下会有高亮圆圈。之后你可以移动角色，并主动和不同的 AI 角色聊天。
          </p>
          <p className="text-2xl mt-2">操作：</p>
          <p className="mt-4">点击地图上的位置可以移动你的角色。</p>
          <p className="mt-4">
            想和某个 AI 角色聊天时，先点击他们，再点击“Start conversation”。对方会向你走来，靠近后对话会自动开始。
            你可以随时关闭对话面板或走开来结束聊天。AI 角色也可能主动邀请你聊天，届时消息面板里会出现接受按钮。
          </p>
          <p className="mt-4">
            AI Town 同时最多支持 {MAX_HUMAN_PLAYERS} 名人类玩家。如果你连续五分钟没有操作，你的角色会自动离开模拟。
          </p>
        </div>
      </ReactModal>
      {/*<div className="p-3 absolute top-0 right-0 z-10 text-2xl">
        <Authenticated>
          <UserButton afterSignOutUrl="/ai-town" />
        </Authenticated>

        <Unauthenticated>
          <LoginButton />
        </Unauthenticated>
      </div> */}

      <div className="w-full lg:min-h-screen relative isolate overflow-hidden p-3 lg:p-4 shadow-2xl flex flex-col justify-start">
        <h1 className="mx-auto text-4xl p-2 sm:text-7xl lg:text-8xl font-bold font-display leading-none tracking-wide game-title w-full text-left sm:text-center sm:w-auto">
          AI Town
        </h1>

        <div className="max-w-xs md:max-w-xl lg:max-w-none mx-auto my-2 text-center text-base sm:text-xl md:text-2xl text-white leading-tight shadow-solid">
          一个由 AI 角色生活、聊天和社交的虚拟小镇。
          {/* <Unauthenticated>
            <div className="my-1.5 sm:my-0" />
            Log in to join the town
            <br className="block sm:hidden" /> and the conversation!
          </Unauthenticated> */}
        </div>

        <Game />

        <footer className="justify-end bottom-0 left-0 w-full flex items-center mt-4 gap-3 p-6 flex-wrap pointer-events-none">
          <div className="flex gap-4 flex-grow pointer-events-none">
            <FreezeButton />
            <MusicButton />
            <Button href="https://github.com/Terrylol/ai-town" imgUrl={starImg}>
              Star
            </Button>
            <InteractButton />
            <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
              帮助
            </Button>
          </div>
        </footer>
        <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
      </div>
    </main>
  );
}

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '50%',

    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
