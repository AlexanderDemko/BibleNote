﻿using BibleNote.Analytics.Models.Common;
using BibleNote.Analytics.Models.Scheme;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.Environment
{
    public interface IApplicationManager
    {
        ModuleInfo CurrentModuleInfo { get; }

        XMLBIBLE CurrentBibleContent { get; }

        XMLBIBLE GetBibleContent(string moduleShortName);

        void ReloadInfo();
    }
}
