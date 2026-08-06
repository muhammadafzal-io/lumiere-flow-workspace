"use client";

import dynamic from "next/dynamic";

export default dynamic(() => import("./page-client"), { ssr: false });
