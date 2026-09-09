"""Independent tiny integrations, dense equations and observations; no trajectories."""
import math
import numpy as np

EPS = 2.**-52


def field(x, y, t):
    a = .25 + .0075*t*np.sin(8*np.pi*x) + .03*np.sin(22*np.pi*x + np.pi*t/16)
    return .5*(1-np.tanh((y-a)/np.sqrt(.0008)))


def forcing(x, y, t):
    # Different form: eta_t + 4eta(eta-1)(eta-.5) - kappa*Laplacian(eta).
    p = 22*np.pi*x + np.pi*t/16
    a = .25 + .0075*t*np.sin(8*np.pi*x) + .03*np.sin(p)
    ax = .0075*t*8*np.pi*np.cos(8*np.pi*x) + .03*22*np.pi*np.cos(p)
    axx = -.0075*t*(8*np.pi)**2*np.sin(8*np.pi*x) - .03*(22*np.pi)**2*np.sin(p)
    at = .0075*np.sin(8*np.pi*x) + .03*np.pi/16*np.cos(p)
    scale = np.sqrt(.0008); z = (y-a)/scale
    h = np.tanh(z); q = 1-h*h; u = .5*(1-h)
    eta_t = .5*q*at/scale
    lap = h*q*(1+ax*ax)/scale**2 + .5*q*axx/scale
    return eta_t + 4*u*(u-1)*(u-.5) - .0004*lap


def fv_equation(old, source, bottom, top):
    a = np.eye(32); b = old + .01*(-4*old*(old-1)*(old-.5)+source)
    c = .01*.0004/.125**2
    for row in range(32):
        j, i = divmod(row, 8)
        for neighbor in (j*8+(i-1)%8, j*8+(i+1)%8):
            a[row, row] += c; a[row, neighbor] -= c
        for dj, bound in ((-1, bottom), (1, top)):
            if 0 <= j+dj < 4:
                a[row, row] += c; a[row, (j+dj)*8+i] -= c
            else:
                a[row, row] += 2*c; b[row] += 2*c*bound[i]
    return a, b


def geometry_reference():
    coords = np.array([[x/8, y/8] for y in range(5) for x in range(9)])
    mapping = np.array([8*(i//9)+(i%9)%8 for i in range(45)])
    triangles = []
    for cell in range(32):
        y, x = divmod(cell, 8); a = 9*y+x
        triangles += [[a, a+1, a+10], [a, a+10, a+9]]
    return coords, mapping, np.array(triangles)


def dense_matrices(coords, mapping, triangles):
    m, k = np.zeros((40, 40)), np.zeros((40, 40))
    for tri in triangles:
        p = coords[tri]
        double_area = ((p[1, 0]-p[0, 0])*(p[2, 1]-p[0, 1])
                       - (p[2, 0]-p[0, 0])*(p[1, 1]-p[0, 1]))
        bx = np.array([p[1, 1]-p[2, 1], p[2, 1]-p[0, 1], p[0, 1]-p[1, 1]])
        by = np.array([p[2, 0]-p[1, 0], p[0, 0]-p[2, 0], p[1, 0]-p[0, 0]])
        for i in range(3):
            for j in range(3):
                ii, jj = mapping[tri[i]], mapping[tri[j]]
                m[ii, jj] += double_area*(2 if i == j else 1)/24
                k[ii, jj] += (bx[i]*bx[j]+by[i]*by[j])/(2*double_area)
    return m, k


def poly_product(a, b):
    out = {}
    for ia, va in a.items():
        for ib, vb in b.items():
            index = tuple(x+y for x, y in zip(ia, ib))
            out[index] = out.get(index, 0.) + va*vb
    return out


def reaction_exact(coords, mapping, triangles, state):
    out = np.zeros(40)
    for tri in triangles:
        p = coords[tri]
        det = abs((p[1, 0]-p[0, 0])*(p[2, 1]-p[0, 1])-(p[2, 0]-p[0, 0])*(p[1, 1]-p[0, 1]))
        u = {(1, 0, 0): state[mapping[tri[0]]], (0, 1, 0): state[mapping[tri[1]]],
             (0, 0, 1): state[mapping[tri[2]]]}
        square = poly_product(u, u); cube = poly_product(square, u)
        poly = {}
        for factor, terms in ((-4, cube), (6, square), (-2, u)):
            for exponent, value in terms.items():
                poly[exponent] = poly.get(exponent, 0.) + factor*value
        for local, global_id in enumerate(mapping[tri]):
            value = 0.
            for exponent, coefficient in poly.items():
                power = list(exponent); power[local] += 1
                moment = math.prod(math.factorial(n) for n in power)/math.factorial(sum(power)+2)
                value += coefficient*moment
            out[global_id] += det*value
    return out


def rule(level):
    # Independent reference (xi,eta) implementation, mapped by subtriangle.
    subtriangles = [np.array([[0., 0.], [1., 0.], [0., 1.]])]
    for _ in range(level):
        result = []
        for tri in subtriangles:
            a, b, c = tri; ab=(a+b)/2; bc=(b+c)/2; ca=(c+a)/2
            result.extend([np.array([a, ab, ca]), np.array([ab, b, bc]),
                           np.array([ca, bc, c]), np.array([ab, bc, ca])])
        subtriangles = result
    nodes, weights = np.polynomial.legendre.leggauss(3)
    nodes=(nodes+1)/2; weights=weights/2
    points, factors = [], []
    for tri in subtriangles:
        bmat = np.column_stack([tri[1]-tri[0], tri[2]-tri[0]])
        det = abs(np.linalg.det(bmat))
        for i, s in enumerate(nodes):
            for j, t in enumerate(nodes):
                xy = tri[0] + bmat @ np.array([s, (1-s)*t])
                points.append([1-xy.sum(), xy[0], xy[1]])
                factors.append(weights[i]*weights[j]*(1-s)*det)
    return np.array(points), np.array(factors)


def force_load(coords, mapping, triangles, time_value, level):
    bary, weights = rule(level); result = np.zeros(40)
    for tri in triangles:
        p = coords[tri]; xy = bary @ p
        det = abs(np.linalg.det(np.column_stack([p[1]-p[0], p[2]-p[0]])))
        values = forcing(xy[:, 0], xy[:, 1], time_value)
        for i, index in enumerate(mapping[tri]):
            result[index] += det*np.dot(weights, bary[:, i]*values)
    return result


def continuous_errors(coords, mapping, triangles, state, time_value):
    result = []
    for level in range(3):
        bary, weights = rule(level); total = 0.
        for tri in triangles:
            p = coords[tri]; xy = bary @ p
            det = abs(np.linalg.det(np.column_stack([p[1]-p[0], p[2]-p[0]])))
            error = bary @ state[mapping[tri]] - field(xy[:, 0], xy[:, 1], time_value)
            total += det*np.dot(weights, error**2)
        result.append(math.sqrt(total))
    return result


def projection(method, state, coords=None, mapping=None, triangles=None):
    totals = np.zeros(8); area_sums = np.zeros(8)
    if method == "FV":
        for coarse in range(8):
            cy, cx = divmod(coarse, 4)
            for j in range(4):
                for i in range(8):
                    overlap_x=max(0., min((i+1)/8,(cx+1)/4)-max(i/8,cx/4))
                    overlap_y=max(0., min((j+1)/8,(cy+1)/4)-max(j/8,cy/4))
                    a=overlap_x*overlap_y
                    totals[coarse] += a*state[j*8+i]; area_sums[coarse] += a
    else:
        for coarse in range(8):
            cy, cx=divmod(coarse,4)
            for tri in triangles:
                p=coords[tri]; center=p.mean(axis=0)
                if cx/4 <= center[0] < (cx+1)/4 and cy/4 <= center[1] < (cy+1)/4:
                    a=abs(np.linalg.det(np.column_stack([p[1]-p[0],p[2]-p[0]])))/2
                    totals[coarse] += a*sum(state[mapping[tri]])/3; area_sums[coarse] += a
    return totals/area_sums, area_sums
