export default function ProcessingLoader() {
  return (
    <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
      <div className="relative w-48 h-64 border-4 border-dashed border-gray-200 rounded-3xl overflow-hidden mb-8">
        {/* Scanning effect */}
        <div className="absolute inset-x-0 w-full h-1/2 bg-gradient-to-b from-transparent to-black/10 animate-scan"></div>
        {/* Skeleton content */}
        <div className="absolute inset-0 p-4 flex flex-col justify-between">
          <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse"></div>
          <div className="space-y-2">
            <div className="h-24 bg-gray-200 rounded-xl w-3/4 mx-auto animate-pulse delay-75"></div>
            <div className="h-4 bg-gray-200 rounded-full w-full animate-pulse delay-150"></div>
          </div>
        </div>
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-black mb-2 animate-pulse">
        Generating Try-On...
      </h2>
      <p className="text-gray-500 font-medium max-w-[250px] text-center">
        Our AI is analyzing the fit and styling. This takes a few seconds.
      </p>

      {/* Tailwind custom animation for scanner line */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0% { top: -50%; }
          100% { top: 100%; }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}} />
    </div>
  );
}
