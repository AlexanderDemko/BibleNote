using BibleNote.Analytics.Contracts.Providers;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Providers.WebNavigationProvider
{
    public class WebNavigationProvider : INavigationProvider
    {
        public string Name
        {
            get
            {
                return "WebNavigationProvider";
            }
        }

        public string Description
        {
            get
            {
                return "Internet documents (.txt, .html, .docx, .doc.)";
            }
        }
    }
}
