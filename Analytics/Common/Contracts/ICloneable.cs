using System;
using System.Collections.Generic;
using System.Text;

namespace BibleNote.Analytics.Common.Contracts
{
    public interface ICloneable<T>
    {
        T Clone();
    }
}
