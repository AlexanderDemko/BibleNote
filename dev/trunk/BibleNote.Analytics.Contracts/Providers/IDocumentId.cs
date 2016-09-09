using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Contracts.Providers
{
    public interface IDocumentId
    {
        bool IsReadonly { get; }

        bool Changed { get; set; }
    }
}
