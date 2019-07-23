using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Analytics.Models.Contracts.ParseResult
{
    public interface ICapacityInfo
    {
        int TextLength { get; }

        /// <summary>
        /// Include subverses
        /// </summary>
        int VersesCount { get; }
    }
}
