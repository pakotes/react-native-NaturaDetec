declare module '*.webp' {
    const value: number;
    export default value;
}

declare module '*.svg' {
  import * as React from 'react';
  const content: React.FC<React.SVGProps<SVGSVGElement>>;
  export default content;
}